'use strict';

// Note: This is the list of formats
// The rules that formats use are stored in data/rulesets.js

/**@type {(FormatsData | {section: string, column?: number})[]} */
let Formats = [

	{
		section: "Sam's stuff 😎",
	},
	{
		name: "[🔥🔥🔥]Sam Battle Factory",
		mod: 'gen7',
		team: 'optional',
		gameType: 'doubles',
		challengeShow: true,
		searchShow: true,
		rated: false,
		ruleset: ['Obtainable', 'Cancel Mod'],
	}
];

exports.Formats = Formats;
