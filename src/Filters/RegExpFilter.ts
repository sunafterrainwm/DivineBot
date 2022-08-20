import { BigNumber } from 'bignumber.js';

import * as hooks from 'src/hooks';
import { BaseFilter } from 'src/Filters/BaseFilter';

export class RegExpFilter implements BaseFilter {
	protected symbol = Symbol();

	constructor( protected regexp: RegExp, protected luckMsg: string, protected percentage: number | BigNumber = 0 ) {

	}

	binding() {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;
		hooks.onResolveAskProbability.add( function ( ask ) {
			if ( that.regexp.exec( ask.rawQuery ) ) {
				ask.probability = that.symbol;
				return true;
			}
			return null;
		} );
		hooks.onProbabilityToLuck.add( function ( ask ) {
			if ( ask.probability === that.symbol ) {
				return that.luckMsg;
			}
		} );
		hooks.onProbabilityToString.add( function ( ask ) {
			if ( ask.probability === that.symbol ) {
				ask.probability = new BigNumber( that.percentage );
			}
		} );
	}
}
