import * as hooks from 'src/hooks';
import { BaseFilter } from 'src/Filters/BaseFilter';

export type RevertKeyWord = string | RegExp;

export class ForceFreshFilter implements BaseFilter {
	binding() {
		hooks.overrideFilterAskProbability.add( function ( ask ) {
			ask.ask = ask.ask.replace( /\$force$/, '' );
		} );
		hooks.onStoreProbabilityCache.add( function ( ask ) {
			if ( ask.rawQuery.match( /\$force$/ ) ) {
				return false;
			}
		} );
	}
}
