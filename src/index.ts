/* eslint-disable no-shadow */
import moduleAlias = require( 'module-alias' );
import path = require( 'path' );
moduleAlias.addAliases( {
	src: __dirname,
	config: path.join( __dirname, '../config' )
} );

import { BigNumber } from 'bignumber.js';
import cheerio = require( 'cheerio' );
import { job as cronJob } from 'cron';
import crypto = require( 'crypto' );
import fs = require( 'fs' );
import LRU = require( 'lru-cache' );
import winston = require( 'winston' );
import TelegramLogger = require( 'winston-telegram' );
import util = require( 'util' );

import { Telegraf, Context, Markup, NarrowedContext } from 'telegraf';
import type * as TT from 'typegram';

import * as hooks from 'src/hooks';
import { config } from 'config/config';
import { cloneDeep } from 'lodash';

const QUERY_RESPONSE_TIMEOUT = 'query is too old and response timeout expired or query ID is invalid';
const CANNOT_PARSE_ENTITIES = "Can't parse entities";

type Probability = BigNumber | symbol;

type InlineContext = NarrowedContext<Context, TT.Update.InlineQueryUpdate>;

type Probabilities = Record<'luck' | 'percentage' | 'coin' | 'dice6', string | null>;

export interface IBaseAsk {
	id?: string;
	readonly userId: number;
	readonly rawQuery: string;
	ask?: string;
	probability?: Probability;
	reverted?: boolean;
	probabilities?: Probabilities;
}

export type IAsk = Required<IBaseAsk>;

const askCache = new LRU<`${ string }@${ number }`, IAsk>( {
	max: 10000,
	ttl: 86400 * 1000
} );

cronJob( {
	cronTime: '0 0 0 * * *',
	onTick() {
		askCache.clear();
	}
} ).start();

// 日志初始化
const logFormat: winston.Logform.FormatWrap = winston.format( function ( info: winston.Logform.TransformableInfo ) {
	info.level = info.level.toUpperCase();
	if ( 'stack' in info ) {
		info.message += `\n${ String( info.stack ) }`;
	}
	return info;
} );

winston.add( new winston.transports.Console( {
	format: winston.format.combine(
		logFormat(),
		winston.format.colorize(),
		winston.format.timestamp( {
			format: 'YYYY-MM-DD HH:mm:ss'
		} ),
		winston.format.printf( function ( info ) {
			return `${ String( info.timestamp ) } [${ info.level }] ${ String( info.message ) }`;
		} )
	)
} ) );

process.on( 'unhandledRejection', function ( _reason, promise ) {
	promise.catch( function ( e ) {
		winston.error( 'Unhandled Rejection: ', e );
	} );
} );

process.on( 'uncaughtException', function ( err ) {
	winston.error( 'Uncaught exception:', err );
} );

process.on( 'rejectionHandled', function () {
	// 忽略
} );

process.on( 'warning', ( warning ) => {
	winston.warn( warning );
} );

// 日志等级、文件设置
if ( config.logging?.level ) {
	winston.level = config.logging.level;
} else {
	winston.level = 'info';
}

if ( config.logging?.logfile ) {
	const files: winston.transports.FileTransportInstance = new winston.transports.File( {
		filename: config.logging.logfile,
		format: winston.format.combine(
			logFormat(),
			winston.format.timestamp( {
				format: 'YYYY-MM-DD HH:mm:ss'
			} ),
			winston.format.printf( function ( info ) {
				return `${ String( info.timestamp ) } [${ info.level }] ${ String( info.message ) }`;
			} )
		)
	} );
	winston.add( files );
}

const $ = cheerio.load( '' );

winston.info( 'DivineBot v1.0.0' );
winston.info( '' );
winston.info( 'Starting Telegram bot...' );

const bot = new Telegraf( config.token );

if ( config.logging?.logToChannel ) {
	class TelegramLoggerError extends Error {
		name = 'TelegramLoggerError';
	}
	class CustomTelegramLogger extends TelegramLogger {
		public chatId!: number;

		public log( info: winston.Logform.TransformableInfo, next: () => void ) {
			if ( String( info.message ).match( 'TelegramLoggerError' ) ) {
				// @ts-expect-error TS2554
				return next( null, true );
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-non-null-assertion
			return super.log!( info, next );
		}

		public sendMessage( messageText: string ) {
			// eslint-disable-next-line @typescript-eslint/no-this-alias
			const self = this;
			bot.telegram.sendMessage( this.chatId, messageText ).then( function ( message ) {
				self.emit( 'logged', message );
			}, function toCatch( error ) {
				if ( error instanceof Error ) {
					const tError = new TelegramLoggerError( error.message );
					Error.captureStackTrace( tError, toCatch );
					tError.stack = String( tError.stack ) +
						'\nFrom previous ' +
						String( error.stack ).split( '\n' ).slice( 0, 2 ).join( '\n' ) + '\n';
					throw tError;
				} else {
					throw new TelegramLoggerError( String( error ) );
				}
			} );
		}
	}
	const logger = new CustomTelegramLogger( {
		token: config.token,
		chatId: config.logging.logToChannel,
		disableNotification: true,
		template: '[{level}] {message}',
		level: winston.level,
		unique: false,
		batchingDelay: 1000
	} );
	winston.add( logger );
}

function htmlEscape( str: string ): string {
	return $( '<div>' ).text( str ).html() ?? '';
}

type RandomProbabilityResult = [ reverted: boolean, probability: Probability ];

function getRandomProbability(): RandomProbabilityResult {
	return [ BigNumber.random( 1 ).toNumber() > 0.5, BigNumber.random( 4 ).multipliedBy( 100 ) ];
}

function getProbability( ask: IBaseAsk ): void {
	const [ reverted, probability ]: RandomProbabilityResult = getRandomProbability();
	const hasEdited = hooks.onResolveAskProbability.emit( ask );
	if ( hasEdited ) {
		ask.reverted = ask.reverted ?? reverted;
	} else {
		ask.probability = probability;
		ask.reverted = reverted;
		while ( hooks.rejectRandomProbability.emit( ask ) ) {
			[ , ask.probability ] = getRandomProbability();
		}
	}
}

function getRandomID(): string {
	return Math.floor( Date.now() + Math.random() * 10000 ).toString( 16 );
}

function getSHA256( data: crypto.BinaryLike ): string {
	return crypto.createHash( 'sha256' ).update( data ).digest( 'hex' );
}

function fetchCache( { userId, rawQuery }: IBaseAsk ): IAsk | false {
	const key = `${ getSHA256( rawQuery ) }@${ userId }` as const;

	const hAsk = hooks.onFetchProbabilityCache.emit( rawQuery, userId );

	return hAsk ?? ( askCache.has( key ) ? Object.assign( {}, askCache.get( key ) ) : false );
}

function storeCache( ask: IAsk ): void {
	const { rawQuery, userId } = ask;

	const hAsk = hooks.onStoreProbabilityCache.emit( ask );

	if ( hAsk === false ) {
		return;
	}

	askCache.set( `${ getSHA256( rawQuery ) }@${ userId }` as const, Object.assign( {}, ask ) );
}

enum ProbabilityTransform {
	Luck,
	Percentage,
	Coin,
	Dice6
}

function probabilityToLuck( ask: IAsk ) {
	const hProbability = hooks.onProbabilityToLuck.emit( ask );
	if ( hProbability !== null ) {
		return hProbability;
	}
	let probability = hooks.onProbabilityToString.emit( ask ) ?? ask.probability;
	if ( typeof probability === 'number' ) {
		probability = new BigNumber( probability );
	}

	if ( BigNumber.isBigNumber( probability ) ) {
		if ( probability.isGreaterThanOrEqualTo( 0 ) && probability.isLessThanOrEqualTo( 12.5 ) ) {
			return '大凶';
		} else if ( probability.isGreaterThan( 12.5 ) && probability.isLessThanOrEqualTo( 25 ) ) {
			return '凶';
		} else if ( probability.isGreaterThan( 25 ) && probability.isLessThanOrEqualTo( 37.5 ) ) {
			return '小凶';
		} else if ( probability.isGreaterThan( 37.5 ) && probability.isLessThanOrEqualTo( 62.5 ) ) {
			return '尚可';
		} else if ( probability.isGreaterThan( 62.5 ) && probability.isLessThanOrEqualTo( 75 ) ) {
			return '小吉';
		} else if ( probability.isGreaterThan( 75 ) && probability.isLessThanOrEqualTo( 87.5 ) ) {
			return '吉';
		} else if ( probability.isGreaterThan( 87.5 ) && probability.isLessThanOrEqualTo( 100 ) ) {
			return '大吉';
		}
	}
	const err = new Error( "probabilityToLuck can't transport probability: " + String( probability ) );
	process.nextTick( function () {
		throw err;
	} );
	return '內部錯誤';
}

function probabilityToPercentage( ask: IAsk ) {
	const hProbability = hooks.onProbabilityToPercentage.emit( ask );
	if ( hProbability !== null ) {
		return hProbability;
	}
	let probability = hooks.onProbabilityToString.emit( ask ) ?? ask.probability;
	if ( typeof probability === 'number' ) {
		probability = new BigNumber( probability );
	}

	if ( BigNumber.isBigNumber( probability ) ) {
		if ( ask.reverted ) {
			probability = new BigNumber( '100' ).plus( probability.negated() );
		}
		if ( probability.isGreaterThanOrEqualTo( 0 ) && probability.isLessThanOrEqualTo( 100 ) ) {
			return probability.toFixed( 2 );
		}
	}
	const err = new Error( "probabilityToPercentage can't transport probability: " + String( probability ) );
	process.nextTick( function () {
		throw err;
	} );
	return '??.??';
}

function probabilityToCoin( ask: IAsk ) {
	const hProbability = hooks.onProbabilityToCoin.emit( ask );
	if ( hProbability !== null ) {
		return hProbability;
	}
	let probability = hooks.onProbabilityToString.emit( ask ) ?? ask.probability;
	if ( typeof probability === 'number' ) {
		probability = new BigNumber( probability );
	}

	if ( BigNumber.isBigNumber( probability ) ) {
		if ( probability.isGreaterThanOrEqualTo( 0 ) && probability.isLessThanOrEqualTo( 50 ) ) {
			return '反面';
		} else if ( probability.isGreaterThan( 50 ) && probability.isLessThanOrEqualTo( 100 ) ) {
			return '正面';
		}
	}
	const err = new Error( "probabilityToCoin can't transport probability: " + String( probability ) );
	process.nextTick( function () {
		throw err;
	} );
	return '...等下，硬幣掉下桌子了啦！！！';
}

function probabilityToDice6( ask: IAsk ) {
	const hProbability = hooks.onProbabilityToDice6.emit( ask );
	if ( hProbability !== null ) {
		return hProbability;
	}
	let probability = hooks.onProbabilityToString.emit( ask ) ?? ask.probability;
	if ( typeof probability === 'number' ) {
		probability = new BigNumber( probability );
	}

	if ( BigNumber.isBigNumber( probability ) ) {
		if ( probability.isGreaterThanOrEqualTo( 0 ) && probability.isLessThanOrEqualTo( 16.66 ) ) {
			return '1';
		} else if ( probability.isGreaterThan( 16.66 ) && probability.isLessThanOrEqualTo( 33.33 ) ) {
			return '2';
		} else if ( probability.isGreaterThan( 33.3 ) && probability.isLessThanOrEqualTo( 50 ) ) {
			return '3';
		} else if ( probability.isGreaterThan( 50 ) && probability.isLessThanOrEqualTo( 66.66 ) ) {
			return '4';
		} else if ( probability.isGreaterThan( 66.66 ) && probability.isLessThanOrEqualTo( 83.33 ) ) {
			return '5';
		} else if ( probability.isGreaterThan( 83.33 ) && probability.isLessThanOrEqualTo( 100 ) ) {
			return '6';
		}
	}
	const err = new Error( "probabilityToDice6 can't transport probability: " + String( probability ) );
	process.nextTick( function () {
		throw err;
	} );
	return '...等下，這不是六面骰啊？！';
}

function getFormatProbability( ask: IAsk, type: ProbabilityTransform, ctx: InlineContext ): string | null {
	let output = '您好，<a href="tg://user?id=' + String( ctx.from.id ) + '">' +
		htmlEscape( ctx.from.first_name + ' ' + ( ctx.from.last_name ?? '' ) ).trim() +
		'</a>\n';

	if ( ask.ask ) {
		output += '所求事項：' + htmlEscape( ask.ask.trim() ) + '\n結果：' + ( function () {
			switch ( type ) {
				case ProbabilityTransform.Luck:
					return probabilityToLuck( ask );

				case ProbabilityTransform.Percentage:
					return '此事有 ' + probabilityToPercentage( ask ) + '% ' + ( ask.reverted ? '不發生' : '發生' );

				case ProbabilityTransform.Coin:
					return '硬幣是' + probabilityToCoin( ask );

				case ProbabilityTransform.Dice6:
					return '擲出了數字 ' + probabilityToDice6( ask );

				default:
					return '伺服器似乎出錯了';
			}
		}() );
	} else {
		switch ( type ) {
			case ProbabilityTransform.Luck:
				output += '汝的今日運勢：' + probabilityToLuck( ask );
				break;

			case ProbabilityTransform.Percentage:
				output += '汝今天' + ( ask.reverted ? '倒大霉' : '行大運' ) + '概率是 ' + probabilityToPercentage( ask ) + '%';
				break;

			default:
				return null;
		}
	}
	return output;
}

function buildInlineQuery( query: string, ctx: InlineContext ) {
	const ask: IBaseAsk = {
		userId: ctx.from.id,
		rawQuery: query,
		ask: query
	};
	let probabilities: Probabilities;
	let id: string;

	const cache = fetchCache( ask );
	if ( cache ) {
		( { probabilities, id } = cache );
		Object.assign( ask, cache );
	} else {
		getProbability( ask as IAsk );
		ask.id = id = getRandomID();
		ask.probabilities = probabilities = {
			luck: getFormatProbability( cloneDeep( ask ) as IAsk, ProbabilityTransform.Luck, ctx ),
			percentage: getFormatProbability( cloneDeep( ask ) as IAsk, ProbabilityTransform.Percentage, ctx ),
			coin: getFormatProbability( cloneDeep( ask ) as IAsk, ProbabilityTransform.Coin, ctx ),
			dice6: getFormatProbability( cloneDeep( ask ) as IAsk, ProbabilityTransform.Dice6, ctx )
		};
		storeCache( ask as IAsk );
	}

	const keyboard: TT.InlineKeyboardButton[][] = [
		query ?
			[
				Markup.button.switchToCurrentChat( '我也試試', '' ),
				Markup.button.switchToCurrentChat( ask.ask ?? '', ask.rawQuery )
			] :
			[
				Markup.button.switchToCurrentChat( '我也試試', '' )
			],
		[
			Markup.button.switchToChat( '轉發', query )
		]
	];

	return {
		result: ( ask.ask ?
			[
				{
					id: id + '_l',
					title: '未卜先知',
					// thumb_url: thumbUrls,
					type: 'article',
					input_message_content: {
						message_text: probabilities.luck,
						parse_mode: 'HTML'
					},
					reply_markup: {
						inline_keyboard: keyboard
					}
				},
				{
					id: id + '_p',
					title: '概率論！',
					// thumb_url: thumbUrls,
					type: 'article',
					input_message_content: {
						message_text: probabilities.percentage,
						parse_mode: 'HTML'
					},
					reply_markup: {
						inline_keyboard: keyboard
					}
				},
				{
					id: id + '_c',
					title: '擲硬幣！',
					// thumb_url: thumbUrls,
					type: 'article',
					input_message_content: {
						message_text: probabilities.coin,
						parse_mode: 'HTML'
					},
					reply_markup: {
						inline_keyboard: keyboard
					}
				},
				{
					id: id + '_d',
					title: '六面骰！',
					// thumb_url: thumbUrls,
					type: 'article',
					input_message_content: {
						message_text: probabilities.dice6,
						parse_mode: 'HTML'
					},
					reply_markup: {
						inline_keyboard: keyboard
					}
				}
			] :
			[
				{
					id: id + '_l',
					title: '未卜先知',
					// thumb_url: thumbUrls,
					type: 'article',
					input_message_content: {
						message_text: probabilities.luck,
						parse_mode: 'HTML'
					},
					reply_markup: {
						inline_keyboard: keyboard
					}
				},
				{
					id: id + '_p',
					title: '概率論！',
					// thumb_url: thumbUrls,
					type: 'article',
					input_message_content: {
						message_text: probabilities.percentage,
						parse_mode: 'HTML'
					},
					reply_markup: {
						inline_keyboard: keyboard
					}
				}
			]
		) as TT.InlineQueryResult[],
		probabilities
	};
}

bot.on( 'inline_query', async function ( ctx ) {
	const { result, probabilities } = buildInlineQuery( ctx.inlineQuery.query, ctx );

	try {
		winston.debug( util.format(
			'[inline] from: %d, query: %s, response: %s',
			ctx.inlineQuery.from.id,
			ctx.inlineQuery.query,
			JSON.stringify( probabilities, function ( _, value: unknown ) {
				if ( !value || typeof value !== 'object' ) {
					return value;
				}
				const result = cloneDeep( value );
				for ( const item in result ) {
					const self = result[ item as PropertyKey ] as unknown;
					if ( self === null ) {
						// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
						delete result[ item as keyof Probabilities ];
						continue;
					} else if ( typeof self === 'string' ) {
						result[ item as keyof Probabilities ] = $( '<div>' ).html( self ).text();
					}
				}
				return result;
			}, 2 )
		) );

		return await ctx.answerInlineQuery( [
			...result
		], {
			cache_time: 0
		} );
	} catch ( ex ) {
		if ( String( ex ).match( QUERY_RESPONSE_TIMEOUT ) ) {
			winston.warn( util.format( 'response timeout expired, check your server config' ) );
			return;
		} else if ( String( ex ).match( CANNOT_PARSE_ENTITIES ) ) {
			winston.warn( util.format( 'string "%s" can\'t parse as html.', result ) );
		} else {
			console.log( ex );
			winston.error( ex );
		}

		ctx.answerInlineQuery( [
			{
				type: 'article',
				id: getRandomID(),
				title: '錯誤',
				description: '錯誤',
				input_message_content: {
					message_text: '生成失敗。'
				}
			}
		], {
			cache_time: 0
		} );
	}
} );

bot.catch( function ( err ) {
	winston.error( 'TelegramBot error:', err );
} );

if ( config.reloadFile ) {
	const file = path.isAbsolute( config.reloadFile ) ? path.normalize( config.reloadFile ) : path.join( __dirname, __dirname.match( /build[\\/]src/ ) ? '../config' : '', config.reloadFile );
	winston.info( util.format( 'Register reload file "%s"', file ) );
	fs.watch( file, function ( event ) {
		winston.warn( util.format( 'Reload file "%s" %s, exit.', file, event ) );
		// eslint-disable-next-line no-process-exit
		process.exit( 1 );
	} );
}

if ( config.launchType === 'webhook' && config.webhook?.url ) {
	try {
		config.webhook.url = new URL( config.webhook.url ).href;
	} catch ( error ) {
		winston.error( `Can't parse webhook url: ${ String( error ) }` );
		// eslint-disable-next-line no-process-exit
		process.exit( 1 );
	}

	// 自动设置Webhook网址
	if ( config.webhook.url ) {
		if ( config.webhook.ssl?.certPath ) {
			bot.telegram.setWebhook( config.webhook.url, {
				certificate: {
					source: config.webhook.ssl.certPath
				}
			} );
		} else {
			bot.telegram.setWebhook( config.webhook.url );
		}
	}

	// 启动Webhook服务器
	if ( !config.webhook.tlsOptions && config.webhook.ssl && config.webhook.ssl.certPath ) {
		config.webhook.tlsOptions = {
			key: fs.readFileSync( config.webhook.ssl.keyPath ),
			cert: fs.readFileSync( config.webhook.ssl.certPath )
		};
		if ( config.webhook.ssl.caPath ) {
			config.webhook.tlsOptions.ca = [
				fs.readFileSync( config.webhook.ssl.caPath )
			];
		}
	}

	bot.launch( {
		webhook: config.webhook
	} ).then( function () {
		winston.info( `Telegram bot has started at ${ config.webhook?.url }.` );
	} );
} else {
	bot.launch().then( function () {
		winston.info( 'Telegram bot has started.' );
	} );
}
