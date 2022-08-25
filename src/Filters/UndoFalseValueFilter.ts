import { BigNumber } from 'bignumber.js';

import * as hooks from 'src/hooks';
import { BaseFilter } from 'src/Filters/BaseFilter';

export type RevertKeyWord = string | RegExp;

export class UndoFalseValueFilter implements BaseFilter {
	constructor( protected keywords: RevertKeyWord[] ) {

	}

	binding() {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;
		hooks.overrideFilterToStringNumber.add( function ( ask ) {
			if ( !BigNumber.isBigNumber( ask.probability ) ) {
				return;
			}
			let askText = ask.ask;
			for ( const keyword of that.keywords ) {
				while ( askText.match( keyword ) ) {
					askText = askText.replace( keyword, '' );
					ask.probability = new BigNumber( '100' ).plus( ask.probability.negated() );
				}
			}
		} );
	}
}
