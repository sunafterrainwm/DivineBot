/* eslint-disable jsdoc/check-tag-names */
import type { IAsk, IBaseAsk } from 'src/index';

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export type HookFunction<A extends unknown[], R, H extends IHook<A, R>> = ( ...args: A ) => H[ 'stopPropagationSymbol' ] | void | R | null;

export interface IHook<A extends unknown[], R> {
	readonly stopPropagationSymbol: symbol;

	add( func: HookFunction<A, R, this>, priority?: number & bigint ): void;
	remove( func: HookFunction<A, R, this> ): boolean;
	emit( ...args: A ): R | null;
}

class Hook<A extends unknown[], R> implements IHook<A, R> {
	protected _hooks = new Map<number, HookFunction<A, R, this>>();

	public readonly stopPropagationSymbol: symbol = Symbol();

	add( func: HookFunction<A, R, this>, priority = 100 ): void {
		while ( this._hooks.has( priority ) ) {
			priority++;
		}
		this._hooks.set( priority, func );
	}

	remove( func: HookFunction<A, R, this> ): boolean {
		let isRemoved = false;

		for ( const [ priority, hFunc ] of this._hooks ) {
			if ( func === hFunc ) {
				isRemoved = true;
				this._hooks.delete( priority );
			}
		}

		return isRemoved;
	}

	emit( ...args: A ): R | null {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for ( const [ _, hFunc ] of this._hooks ) {
			const result = hFunc( ...args );
			if ( result === this.stopPropagationSymbol ) {
				break;
			} else if ( typeof result !== 'undefined' && result !== null ) {
				return result as R;
			}
		}

		return null;
	}
}

export const onResolveAskProbability = new Hook<[ ask: IBaseAsk ], true>();
export const rejectRandomProbability = new Hook<[ ask: IBaseAsk ], true>();
/**
 * @internal
 */
export const overrideFilterAskProbability = new Hook<[ ask: IAsk ], null>();

export const onProbabilityToLuck = new Hook<[ ask: IAsk ], string>();
export const onProbabilityToPercentage = new Hook<[ ask: IAsk ], string>();
export const onProbabilityToCoin = new Hook<[ ask: IAsk ], string>();
export const onProbabilityToDice6 = new Hook<[ ask: IAsk ], string>();
export const onProbabilityToString = new Hook<[ ask: IAsk ], boolean>();
/**
 * @internal
 */
export const overrideFilterToStringNumber = new Hook<[ ask: IAsk ], null>();

export const onStoreProbabilityCache = new Hook<[ ask: IAsk ], boolean>();
export const onFetchProbabilityCache = new Hook<[ rawQuery: string, userId: number ], IAsk | false>();
