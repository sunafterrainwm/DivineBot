import { Telegraf } from 'telegraf';
import winston = require( 'winston' );
import TransportStream, { TransportStreamOptions } from 'winston-transport';

export interface LogToChannelOptions extends TransportStreamOptions {
	telegraf: Telegraf;
	logChannel: number;
}

class LogToChannelError extends Error {
	name = 'LogToChannelError';
}

export class LogToChannel extends TransportStream {
	#telegraf: Telegraf;
	#logChannel: number;
	constructor( options: LogToChannelOptions ) {
		super( options );
		this.#telegraf = options.telegraf;
		this.#logChannel = options.logChannel;
	}
	log( info: winston.Logform.TransformableInfo, callback?: () => void ): void {
		let logText: string;
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const printData: {
				level: string;
				message: string;
			} = JSON.parse( info.message as string );

			logText = `[${ printData.level }] ${ printData.message }`;
		} catch {
			// eslint-disable-next-line no-control-regex
			logText = String( info.message as string ).replace( /\x1b\[\d+m/g, '' );
		}
		if ( !logText.includes( 'LogToChannelError' ) ) {
			this.#telegraf.telegram.sendMessage( this.#logChannel, logText ).catch( function toCatch( error ) {
				if ( error instanceof Error ) {
					const tError = new LogToChannelError( error.message );
					Error.captureStackTrace( tError, toCatch );
					tError.stack = String( tError.stack ) +
						'\nFrom previous ' +
						String( error.stack ).split( '\n' ).slice( 0, 2 ).join( '\n' ) + '\n';
					throw tError;
				} else {
					throw new LogToChannelError( String( error ) );
				}
			} );
		}
		if ( callback ) {
			callback();
		}
	}
}

export {
	LogToChannel as default
};
