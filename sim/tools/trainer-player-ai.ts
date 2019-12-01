/**
 * Example random player AI.
 *
 * Pokemon Showdown - http://pokemonshowdown.com/
 *
 * @license MIT
 */

import {ObjectReadWriteStream} from '../../lib/streams';
import {BattlePlayer, BattleStream} from '../battle-stream';
import {PRNG, PRNGSeed} from '../prng';
import {Dex} from '../dex';
import { Pokemon } from '../pokemon';

class CommandOption {
	command: string;
	pokemon: Template;
	//sometimes a bad but legal move is the only option
	//e.g. choice HH into an empty slot
	//if this is the only option, then we can use it if we have to
	//but we shouldn't analyze it
	avoid: boolean;

	constructor(command: string, pokemon: Template) {
		this.command = command;
		this.pokemon = pokemon;
		this.avoid = false;
	}
}

class MoveOption extends CommandOption {
	move: Move;
	target: Template | "self" | "all" | null;

	constructor(command: string, pokemon: Template, move: Move, target: Template | "self" | "all" | null) {
		super(command, pokemon);
		this.move = move;
		this.target = target;
		if (target === undefined) {
			throw new Error("target is undefined");
		}
	}
}

class SwitchOption extends CommandOption {
	target: Pokemon;
	targetIndex: number;

	constructor(command: string, pokemon: Template, target: Pokemon, targetIndex: number) {
		super(command, pokemon);
		this.target = target;
		this.targetIndex = targetIndex;
	}
}

enum Place {
	myA = "myA",
	myB = "myB",
	oppA = "oppA",
	oppB = "oppB",
}

function placeToTarget(place: Place) : number {
	switch (place) {
		case Place.myA: return -1;
		case Place.myB: return -2;
		case Place.oppA: return 1;
		case Place.oppB: return 2;
	}
}

function targetToPlace(target: number) : Place {
	switch (target) {
		case -1: return Place.myA;
		case -2: return Place.myB;
		case 1: return Place.oppA;
		case 2: return Place.oppB;
		default: throw new Error("Invalid target number");
	}
}

function placeToPartner(place: Place) : Place {
	switch (place) {
		case Place.myA: return Place.myB;
		case Place.myB: return Place.myA;
		case Place.oppA: return Place.oppB;
		case Place.oppB: return Place.oppA;
	}
}

enum Side {
	p1 = "p1",
	p2 = "p2",
}

class BattleState {
	placeToIdTable: { [key in Place]?: string };
	idToSpeciesTable: { [key in string]?: string };
	side: Side;

	constructor(side: Side) {
		this.side = side;
		this.placeToIdTable = {};
		this.idToSpeciesTable = {};
	}

	parsePlace(s: string) : Place {
		if (['p1', 'p2'].includes(s)) {
			s += 'a';
		}
		const slot = s.endsWith('a')
			? 'a'
			: 'b';
		const isOurs = s.startsWith(Side.p1 as string) === (this.side === Side.p1);
		if (slot === 'a' && isOurs) {
			return Place.myA;
		} else if (slot === 'b' && isOurs) {
			return Place.myB;
		} else if (slot === 'a' && !isOurs) {
			return Place.oppA;
		} else {
			return Place.oppB;
		}
	}

	updatePlace(id: string, place: Place) {
		this.placeToIdTable[place] = id;
	}

	updateSpecies(id: string, species: string) {
		this.idToSpeciesTable[id] = species;
	}

	remove(place: Place) {
		const id = this.placeToIdTable[place];
		delete this.placeToIdTable[place];
		//if (id) delete this.idToSpeciesTable[id];
	}

	placeToId(place: Place) : string {
		return this.placeToIdTable[place]!;
	}

	idToSpecies(id: string) : string {
		return this.idToSpeciesTable[id]!;
	}

	placeToSpecies(place: Place) : string {
		const id = this.placeToIdTable[place]!;
		return this.idToSpeciesTable[id]!;
	}

	hasPlace(place: Place) : boolean {
		return !!this.placeToIdTable[place];
	}

	idToPlace(id: string) : Place {
		for(const p in Place) {
			if (this.placeToIdTable[p as Place] === id) {
				return p as Place;
			}
		}
		throw new Error("id not found");
	}
}

export class TrainerPlayerAI extends BattlePlayer {
	protected readonly move: number;
	protected readonly mega: number;
	protected readonly prng: PRNG;
	battleState: BattleState;
	currentRequest: AnyObject | null;
	hasReceivedUpdate: boolean;

	constructor(
		side: "p1" | "p2",
		playerStream: ObjectReadWriteStream<string>,
		options: {move?: number, mega?: number, seed?: PRNG | PRNGSeed | null } = {},
		debug: boolean = false
	) {
		super(playerStream, debug);
		this.move = options.move || 1.0;
		this.mega = options.mega || 0;
		this.prng = options.seed && !Array.isArray(options.seed) ? options.seed : new PRNG(options.seed);
		this.battleState = new BattleState(side as Side);
		this.currentRequest = null;
		this.hasReceivedUpdate = false;
	}

	receive(chunk: string) {
		console.log('start chunk');
		super.receive(chunk);
		console.log('end chunk');
		if (this.currentRequest && this.hasReceivedUpdate) {
			this.respondToRequest();
		}
	}

	receiveError(error: Error) {
		// If we made an unavailable choice we will receive a followup request to
		// allow us the opportunity to correct our decision.
		if (error.message.startsWith('[Unavailable choice]')) return;
		throw error;
	}
	//see https://github.com/smogon/pokemon-showdown/blob/master/sim/SIM-PROTOCOL.md
	receiveLine(line: string) {
		console.log(this.battleState.side, 'got line', line);
		super.receiveLine(line);

		/*
		* If I end up going the dirty cheater route, ignore all these comments
		*
		* watch for messages like `|switch|p2b: Araquanid|Araquanid, L84, M|100/100` so we can update our information about the other side
		* we don't get this information in the request, so we have to update it whenever we get it
		*
		* some examples:
		*
		* |-damage|p2a: nickname|118/143
		* |switch|p2a: nickname|Gardevoir, L50, F|143/143
		*
		* |move|p1b: Ferrothorn|Protect||[still]
		* |-fail|p1b: Ferrothorn
		* |move|p1a: Gardevoir|Ally Switch|p1a: Gardevoir
		* |swap|p1a: Gardevoir|1|[from] move: Ally Switch
		* |move|p2a: nickname|Ally Switch|p2a: nickname
		* |swap|p2a: nickname|1|[from] move: Ally Switch
		* |move|p2a: Rotom|Will-O-Wisp|p1a: Ferrothorn
		*
		* |switch|p1a: Gardevoir|Gardevoir, L50, F|48/48
		* |switch|p1b: Ferrothorn|Ferrothorn, L50, F|48/48
		* |switch|p2a: Ferrothorn|Ferrothorn, L50, F|167/167
		* |switch|p2b: Rotom|Rotom-Wash, L50|157/157
		*		
		* |-damage|p2a: Ferrothorn|116/167
		* |replace|p2a: Zoroark|Zoroark, L50, F
		* |-end|p2a: Zoroark|Illusion
		* |-activate|p2a: Zoroark|move: Struggle
		* |move|p2a: Zoroark|Struggle|p1a: Gardevoir
		* |-crit|p1a: Gardevoir
		* |-damage|p1a: Gardevoir|23/48
		* |replace|p1a: Zoroark|Zoroark, L50, F
		*/

		if (!line.startsWith('|')) return;

		const data = line.split('|');

		//nothing good comes from shorter lines
		if (data.length < 3 || data[1] === 'request') return;

		this.hasReceivedUpdate = true;

		if (!data[2].startsWith("p1") && !data[2].startsWith("p2")) return;

		const placeSep = data[2].indexOf(':');
		const place = this.battleState.parsePlace(data[2].substring(0, placeSep));
		const id = data[2].substring(placeSep + 2);//+2 for ': '

		//all major actions are in the form |ACTION|POKEMON|DETAILS
		//some minor actions don't follow this form
		//minor actions all start with '-', so we'll just exclude them
		//all minor actions that affect the battle state significantly
		//should have a corresponding major action, so I think this is fine
		if (!data[1].startsWith('-')) {
			this.battleState.updatePlace(id, place);
		}

		if (['switch', 'replace', 'drag'].includes(data[1])) {
			const species = data[3].split(',')[0];
			this.battleState.updateSpecies(id, species);
		}

		if (data[1] === '-transform') {
			//|-transform|p2a: Smeargle|p1b: Arcanine
			const placeSep = data[3].indexOf(':');
			const targetId = data[3].substring(placeSep + 2);
			const species = this.battleState.idToSpecies(targetId);
			this.battleState.updateSpecies(id, species);
		}

		if (data[1] === 'faint') {
			this.battleState.remove(place);
		}
	}

	receiveRequest(request: AnyObject) {
		this.currentRequest = request;
		//there will be more information coming, so we should wait to response to the request
	}

	placeToPokemonTemplate(p: Place) : Template | null {
		if (!this.battleState.hasPlace(p)) return null;
		const speciesId = Dex.getId(this.battleState.placeToSpecies(p));
		return Dex.data.Pokedex[speciesId];
	}

	getMoveChoices(place: Place, moveOptions: AnyObject) : MoveOption[] {
		const mon = this.placeToPokemonTemplate(place);
		if (!mon) throw new Error("Invalid place");
		const move = Dex.getMove(moveOptions.move);
		let targets: Place[] = [];
		if ([`normal`, `any`, `adjacentFoe`].includes(moveOptions.target)) {
			targets = [Place.oppA, Place.oppB];
		} else if (moveOptions.target === `adjacentAlly`) {
			targets = [placeToPartner(place)];
		} else if (moveOptions.target === `adjacentAllyOrSelf`) {
			targets = [place, placeToPartner(place)];
		} else {
			//¯\_(ツ)_/¯
			return [new MoveOption(`move ${moveOptions.slot}`, mon, move, "all")];
		}

		return targets.map(p => {
			const t = placeToTarget(p);
			const cmd = `move ${moveOptions.slot} ${t}`;
			const target = this.placeToPokemonTemplate(p);
			return new MoveOption(cmd, mon, move, target);
		});//.filter((m) : m is MoveOption => m !== null);
	}

	respondToRequest() {
		const request = this.currentRequest!;
		console.log('battle state', this.battleState);
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

				const idSep = pokemon[i].ident.indexOf(':')
				const id = pokemon[i].ident.substring(idSep + 2);
				const moveChoices = canMove.flatMap(m => {
					const place = [Place.myA, Place.myB][i];
					/*
					let place: Place | null = null;
					try {
						place = this.battleState.idToPlace(id);
					} catch(e) {
						//this basically only happens with Zoroark
						//the id on the field is different than the ident in the request
						//so we'll just use `i`, which I'm not sure if it's actually right
						//console.error("couldn't find id", id, "trying to use i", pokemon[i], "battle state", this.battleState);
						//console.error("other pokemon", pokemon[i^1])
						if (i === 0) {
							place = Place.myA;
						} else {
							place = Place.myB;
						}
					}
					try {
						this.getMoveOptions(place, m);
					} catch(e) {
						console.error(id, this.battleState, pokemon[i]);
						throw(e);
					}
					*/
					return this.getMoveChoices(place, m);
				});
				const moves = (
					moveChoices.some(mc => !mc.avoid)
						? moveChoices.filter(mc => !mc.avoid)
						: moveChoices
				).map(mo => { return { choice: mo.command, move: {}} });
				console.log('moves', moves);
				//move isn't actually used by anything, but later type definitions want it
				//it'll all get reworked eventually

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
					console.error(this.battleState, request, switches, moves);
					console.error('moves');
					for (const mon in request.active) {
						console.error(request.active[mon]);
					}
					console.error('side');
					for (const mon in request.side.pokemon) {
						console.error(request.side.pokemon[mon]);
					}
					throw new Error(`${this.constructor.name} unable to make choice ${i}. request='${request}',` +
						` chosen='${chosen}', (mega=${canMegaEvo}, ultra=${canUltraBurst}, zmove=${canZMove})`);
				}
			});
			this.choose(choices.join(`, `));
		} else {
			// team preview?
			this.choose(this.chooseTeamPreview(request.side.pokemon));
		}
		//consume the request
		this.currentRequest = null;
		//also we need more updates before we can go to the next request
		this.hasReceivedUpdate = false;
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

//I'm too lazy to integrate this stuff with the existing tests

function parseSideTest_p1() {
	console.log('p1 tests');
	const bs = new BattleState(Side.p1);
	["p1a", "p1b", "p2a", "p2b"].forEach(s => {
		console.log(`${s} => ${bs.parsePlace(s)}`);
	})
}

function parseSideTest_p2() {
	console.log('p2 tests');
	const bs = new BattleState(Side.p2);
	["p1a", "p1b", "p2a", "p2b"].forEach(s => {
		console.log(`${s} => ${bs.parsePlace(s)}`);
	})
}

//parseSideTest_p1();
//parseSideTest_p2();