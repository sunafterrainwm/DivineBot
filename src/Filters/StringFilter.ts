import { escapeRegExp } from 'lodash';
import type { BigNumber } from 'bignumber.js';

import { RegExpFilter } from 'src/Filters/RegExpFilter';

export class StringFilter extends RegExpFilter {
	constructor( string: string, luckMsg: string, prcentage?: number | BigNumber ) {
		super( new RegExp( escapeRegExp( string ) ), luckMsg, prcentage );
	}
}
