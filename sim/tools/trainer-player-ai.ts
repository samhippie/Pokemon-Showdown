/**
 * Example random player AI.
 *
 * Pokemon Showdown - http://pokemonshowdown.com/
 *
 * @license MIT
 */

import {ObjectReadWriteStream} from '../../lib/streams';
import {BattlePlayer} from '../battle-stream';
import {PRNG, PRNGSeed} from '../prng';
import {Dex} from '../dex';
import { Pokemon } from '../pokemon';

class CommandOption {
	command: string;
	pokemon: Pokemon;

	constructor(command: string, pokemon: Pokemon) {
		this.command = command;
		this.pokemon = pokemon;
	}
}

class MoveOption extends CommandOption {
	move: Move;
	target: Pokemon | "self" | "all";

	constructor(command: string, pokemon: Pokemon, move: Move, target: Pokemon | "self" | "all") {
		super(command, pokemon);
		this.move = move;
		this.target = target;
	}
}

class SwitchOption extends CommandOption {
	target: Pokemon;
	targetIndex: number;

	constructor(command: string, pokemon: Pokemon, target: Pokemon, targetIndex: number) {
		super(command, pokemon);
		this.target = target;
		this.targetIndex = targetIndex;
	}
}

export class TrainerPlayerAI extends BattlePlayer {
	protected readonly move: number;
	protected readonly mega: number;
	protected readonly prng: PRNG;
	mySide: "p1" | "p2";

	constructor(
		side: "p1" | "p2",
		playerStream: ObjectReadWriteStream<string>,
		options: {move?: number, mega?: number, seed?: PRNG | PRNGSeed | null } = {},
		debug: boolean = false
	) {
		super(playerStream, debug);
		this.mySide = side;
		this.move = options.move || 1.0;
		this.mega = options.mega || 0;
		this.prng = options.seed && !Array.isArray(options.seed) ? options.seed : new PRNG(options.seed);
	}

	receiveError(error: Error) {
		// If we made an unavailable choice we will receive a followup request to
		// allow us the opportunity to correct our decision.
		if (error.message.startsWith('[Unavailable choice]')) return;
		throw error;
	}

	receiveLine(line: string) {
		console.log('got line', line);
		super.receiveLine(line);

		//If I end up going the dirty cheater route, ignore all these comments

		//watch for messages like `|switch|p2b: Araquanid|Araquanid, L84, M|100/100` so we can update our information about the other side
		//we don't get this information in the request, so we have to update it whenever we get it

		//some examples:

		//|-damage|p2a: nickname|118/143
		//|switch|p2a: nickname|Gardevoir, L50, F|143/143

		//|move|p1b: Ferrothorn|Protect||[still]
		//|-fail|p1b: Ferrothorn
		//|move|p1a: Gardevoir|Ally Switch|p1a: Gardevoir
		//|swap|p1a: Gardevoir|1|[from] move: Ally Switch
		//|move|p2a: nickname|Ally Switch|p2a: nickname
		//|swap|p2a: nickname|1|[from] move: Ally Switch
		//|move|p2a: Rotom|Will-O-Wisp|p1a: Ferrothorn

		//|switch|p1a: Gardevoir|Gardevoir, L50, F|48/48
		//|switch|p1b: Ferrothorn|Ferrothorn, L50, F|48/48
		//|switch|p2a: Ferrothorn|Ferrothorn, L50, F|167/167
		//|switch|p2b: Rotom|Rotom-Wash, L50|157/157
		
		//|-damage|p2a: Ferrothorn|116/167
		//|replace|p2a: Zoroark|Zoroark, L50, F
		//|-end|p2a: Zoroark|Illusion
		//|-activate|p2a: Zoroark|move: Struggle
		//|move|p2a: Zoroark|Struggle|p1a: Gardevoir
		//|-crit|p1a: Gardevoir
		//|-damage|p1a: Gardevoir|23/48
		//|replace|p1a: Zoroark|Zoroark, L50, F

		const data = line.split('|');
		if (['switch', 'replace', 'drag'].includes(data[1])) {
			//update id => species table
		}

		if (data[1] === 'faint') {
			//remove mon from place => id table
		}

		if (data.length > 2) {
			const i = data[2].indexOf(':');
			const place = data[2].substring(0, i);
			const name = data[2].substring(i);
			//update place => id table
		}

	}

	receiveRequest(request: AnyObject) {
		console.log('rando req', request);
		if (request.wait) {
			// wait request
			// do nothing
		} else if (request.forceSwitch) {
			// switch request
			const pokemon = request.side.pokemon;
			const chosen: number[] = [];
			const choices = request.forceSwitch.map((mustSwitch: AnyObject) => {
				if (!mustSwitch) return `pass`;

				const canSwitch = [1, 2, 3, 4, 5, 6].filter(i => (
					pokemon[i - 1] &&
					// not active
					i > request.forceSwitch.length &&
					// not chosen for a simultaneous switch
					!chosen.includes(i) &&
					// not fainted
					!pokemon[i - 1].condition.endsWith(` fnt`)
				));

				if (!canSwitch.length) return `pass`;
				const target = this.chooseSwitch(
					canSwitch.map(slot => ({slot, pokemon: pokemon[slot - 1]})));
				chosen.push(target);
				return `switch ${target}`;
			});

			this.choose(choices.join(`, `));
		} else if (request.active) {
			// move request
			let [canMegaEvo, canUltraBurst, canZMove] = [true, true, true];
			const pokemon = request.side.pokemon;
			const chosen: number[] = [];
			const choices = request.active.map((active: AnyObject, i: number) => {
				if (pokemon[i].condition.endsWith(` fnt`)) return `pass`;

				canMegaEvo = canMegaEvo && active.canMegaEvo;
				canUltraBurst = canUltraBurst && active.canUltraBurst;
				canZMove = canZMove && !!active.canZMove;

				let canMove = [1, 2, 3, 4].slice(0, active.moves.length).filter(j => (
					// not disabled
					!active.moves[j - 1].disabled
					// NOTE: we don't actually check for whether we have PP or not because the
					// simulator will mark the move as disabled if there is zero PP and there are
					// situations where we actually need to use a move with 0 PP (Gen 1 Wrap).
				)).map(j => ({
					slot: j,
					move: active.moves[j - 1].move,
					target: active.moves[j  - 1].target,
					zMove: false,
				}));
				//FIXME for now I'm disabling zmoves
				/*
				if (canZMove) {
					canMove.push(...[1, 2, 3, 4].slice(0, active.canZMove.length)
						.filter(j => active.canZMove[j - 1])
						.map(j => ({
							slot: j,
							move: active.canZMove[j - 1].move,
							target: active.canZMove[j - 1].target,
							zMove: true,
						})));
				}
				*/

				// Filter out adjacentAlly moves if we have no allies left, unless they're our
				// only possible move options.
				const hasAlly = pokemon[i ^ 1] && !pokemon[i ^ 1].condition.endsWith(` fnt`);
				const filtered = canMove.filter(m => m.target !== `adjacentAlly` || hasAlly);
				canMove = filtered.length ? filtered : canMove;

				const mon = pokemon[i].details.split(',')[0];
				const moves = canMove.map(m => {
					//console.log('move', m);
					//console.log('move data', Dex.getMove(m.move));
					let move = `move ${m.slot}`;
					// NOTE: We don't generate all possible targeting combinations.
					let ms: string[] = [];
					if (request.active.length > 1) {
						if ([`normal`, `any`, `adjacentFoe`].includes(m.target)) {
							//move += ` ${1 + Math.floor(this.prng.next() * 2)}`;
							/*
							ms = [1, 2].map(t => {
								let cmd = `${move} ${t}${m.zMove ? ` zmove` : ``}`;
								new MoveOption(cmd, mon, Dex.getMove(m.move), );
								
							});
							*/
							ms = [1, 2].map(t => `${move} ${t}`);
						} else if (m.target === `adjacentAlly`) {
							//move += ` -${(i ^ 1) + 1}`;
							ms = [`${move} -${(i ^ 1) + 1}`]
						} else if (m.target === `adjacentAllyOrSelf`) {
							if (hasAlly) {
								//move += ` -${1 + Math.floor(this.prng.next() * 2)}`;
								ms = [-1, -2].map(t => `${move} ${t}`)
							} else {
								ms = [`${move} -${i + 1}`]
								//move += ` -${i + 1}`;
							}
						} else {
							ms = [move];
						}
					} else {
						ms = [move];
					}
					//if (m.zMove) move += ` zmove`;
					if (m.zMove) ms = ms.map(m => m + ` zmove`)
					console.log('options', ms);
					move = ms[Math.floor(this.prng.next() * ms.length)]
					return {choice: move, move: m};
				});
				//TODO get ms out of map via flatMap
				//do something similar with switches
				//then add enough information to each command in some sort of tuple so we can judge each action separately
				//or calculate a score when we generate the command and put that score next to the command
				
				//make sure that both pokemon aren't switching to the same slot and not both zmoving

				const canSwitch = [1, 2, 3, 4, 5, 6].filter(j => (
					pokemon[j - 1] &&
					// not active
					!pokemon[j - 1].active &&
					// not chosen for a simultaneous switch
					!chosen.includes(j) &&
					// not fainted
					!pokemon[j - 1].condition.endsWith(` fnt`)
				));
				const switches = active.trapped ? [] : canSwitch;

				const switchCommands = canSwitch.map(s => `switch ${s}`)

				if (switches.length && (!moves.length || this.prng.next() > this.move)) {
					const target = this.chooseSwitch(
						canSwitch.map(slot => ({slot, pokemon: pokemon[slot - 1]})));
					chosen.push(target);
					return `switch ${target}`;
				} else if (moves.length) {
					const move = this.chooseMove(moves);
					return move;
					//FIXME I'm disabling megas and ultra bursts too
					/*
					if (move.endsWith(` zmove`)) {
						canZMove = false;
						return move;
					} else if ((canMegaEvo || canUltraBurst) && this.prng.next() < this.mega) {
						if (canMegaEvo) {
							canMegaEvo = false;
							return `${move} mega`;
						} else {
							canUltraBurst = false;
							return `${move} ultra`;
						}
					} else {
						return move;
					}
					*/
				} else {
					throw new Error(`${this.constructor.name} unable to make choice ${i}. request='${request}',` +
						` chosen='${chosen}', (mega=${canMegaEvo}, ultra=${canUltraBurst}, zmove=${canZMove})`);
				}
			});
			this.choose(choices.join(`, `));
		} else {
			// team preview?
			this.choose(this.chooseTeamPreview(request.side.pokemon));
		}
	}

	protected chooseTeamPreview(team: AnyObject[]): string {
		return `team 123456`;
	}

	protected chooseMove(moves: {choice: string, move: AnyObject}[]): string {
		return this.prng.sample(moves).choice;
	}

	protected chooseSwitch(switches: {slot: number, pokemon: AnyObject}[]): number {
		return this.prng.sample(switches).slot;
	}
}
