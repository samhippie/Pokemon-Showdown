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
	score: number;
	//sometimes a bad but legal move is the only option
	//e.g. choice HH into an empty slot
	//if this is the only option, then we can use it if we have to
	//but we shouldn't analyze it
	avoid: boolean;

	constructor(command: string, pokemon: Template) {
		this.command = command;
		this.pokemon = pokemon;
		this.avoid = false;
		this.score = 0;
	}

	//implemented differently for each type of command
	//simple instances of CommandOption are unusual cases and shouldn't be scored
	calcScore(battleState: BattleState) {
		this.score = 0;
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

	calcScore(battleState: BattleState) {
		if (this.move.category == "Status") {
			this.score = 1;
			return;
		}
		const offStat = this.move.category == "Physical"
			? this.pokemon.baseStats.atk
			: this.pokemon.baseStats.spa;
		const defStat = this.move.defensiveCategory == "Physical"
			? this.pokemon.baseStats.def
			: this.pokemon.baseStats.spd;
		//if an offensive move hase a base power of 0, then it's probably something weird
		//just give it a decent base power instead
		const basePower = this.move.basePower || 80;
		//console.log(this.move.name, 'base power', basePower)
		//console.log('off stat', offStat);
		//console.log('def stat', defStat);
		let power = basePower * offStat / defStat;
		//console.log('power', power);
		if (this.pokemon.types.includes(this.move.type)) {
			power *= 1.5;
		}
		//console.log('power after stab', power);
		if (this.target !== 'all' && this.target !== 'self' && this.target !== null) {
			for (const type of this.target.types) {
				power *= typeMultiplier(this.move.type, type);
			}
		}
		//console.log('power after typing', power);
		this.score = power / 100;
	}
}

class SwitchOption extends CommandOption {
	target: Template;
	targetIndex: number;

	constructor(command: string, pokemon: Template, target: Template, targetIndex: number) {
		super(command, pokemon);
		this.target = target;
		this.targetIndex = targetIndex;
	}

	private evaluateType(offTypes: string[], defTypes: string[]) : number {
		const effectivenesses = offTypes.map(ot => {
			let effectiveness = 1;
			for (const dt of defTypes) {
				effectiveness *= typeMultiplier(ot, dt);
			}
			return effectiveness;
		});
		return effectivenesses.sort()[effectivenesses.length - 1];
	}

	calcScore(battleState: BattleState) {
		const enemies = [Place.oppA, Place.oppB].map(p => battleState.placeToSpecies(p))
			.filter(s => !!s)
			.map(s => Dex.data.Pokedex[Dex.getId(s)]);
		const offEffectivenesses = enemies.map(e => this.evaluateType(this.pokemon.types, e.types));
		const defEffectivenesses = enemies.map(e => this.evaluateType(e.types, this.pokemon.types));
		const eff = [...offEffectivenesses,...defEffectivenesses].reduce((a, b) => a * b);
		//make sure that an even change is somewhat below 1 so that we punish wasted turns
		this.score = eff / 4;
	}
}

function typeMultiplier(offType: string, defType: string) : number {
	//console.log(offType, 'hitting', defType);
	const n = Dex.data.TypeChart[defType].damageTaken[offType];
	switch (n) {
		default: case 0: return 1;
		case 1: return 2;
		case 2: return 0.5;
		case 3: return 0;
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

	placeToId(place: Place) : string | null  {
		return this.placeToIdTable[place] || null;
	}

	idToSpecies(id: string) : string | null{
		return this.idToSpeciesTable[id] || null;
	}

	placeToSpecies(place: Place) : string | null {
		const id = this.placeToIdTable[place] || null;
		return id !== null
			? this.idToSpeciesTable[id] || null
			: null;
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
		super.receive(chunk);
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
		if (data.length < 3 || data[1] === 'request' || data[1] === 'player') return;

		this.hasReceivedUpdate = true;

		if (!data[2].startsWith("p1") && !data[2].startsWith("p2")) return;

		const placeSep = data[2].indexOf(':');
		const place = placeSep !== -1
			? this.battleState.parsePlace(data[2].substring(0, placeSep))
			: null;
		const id = data[2].substring(placeSep + 2);//+2 for ': '

		//all major actions are in the form |ACTION|POKEMON|DETAILS
		//some minor actions don't follow this form
		//minor actions all start with '-', so we'll just exclude them
		//all minor actions that affect the battle state significantly
		//should have a corresponding major action, so I think this is fine
		if (place !== null && !data[1].startsWith('-')) {
			//console.log('updating place', {id: id, place: place, data: data});
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
			const species = this.battleState.idToSpecies(targetId)!;
			this.battleState.updateSpecies(id, species);
		}

		//faint should have a place so this check should be redundant
		if (data[1] === 'faint' && place !== null) {
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

	getMoveChoices(place: Place, options: AnyObject) : MoveOption[] {
		const mon = this.placeToPokemonTemplate(place);
		if (!mon) throw new Error("Invalid place");
		const move = Dex.getMove(options.move);
		let targets: Place[] = [];
		if ([`normal`, `any`, `adjacentFoe`].includes(options.target)) {
			targets = [Place.oppA, Place.oppB];
		} else if (options.target === `adjacentAlly`) {
			targets = [placeToPartner(place)];
		} else if (options.target === `adjacentAllyOrSelf`) {
			targets = [place, placeToPartner(place)];
		} else {
			//¯\_(ツ)_/¯
			return [new MoveOption(`move ${options.slot}`, mon, move, "all")];
		}

		const moveOptions = targets
			.filter(p => this.battleState.placeToId(p) !== null)
			.map(p => {
				const t = placeToTarget(p);
				const cmd = `move ${options.slot} ${t}`;
				const target = this.placeToPokemonTemplate(p);
				return new MoveOption(cmd, mon, move, target);
			});

		return moveOptions.length
			? moveOptions
			//if a move has no valid targets, we can probably just use it anyway
			//but it's probably not a good idea, so only do it when we have to
			: [new MoveOption(`move ${options.slot}`, mon, move, "all")];
	}

	//TODO clean up, remove old parts
	respondToRequest() {
		const request = this.currentRequest!;
		console.log(JSON.stringify(request));
		if (request.wait) {
			// wait request
			// do nothing
		} else if (request.forceSwitch) {
			// switch request
			const pokemon = request.side.pokemon;
			const chosen: number[] = [];
			const choiceOptions: CommandOption[][] = request.forceSwitch.map((mustSwitch: AnyObject, index: number) : CommandOption[] => {
				const species = pokemon[index].details.split(',')[0];
				const mon = Dex.data.Pokedex[Dex.getId(species)];
				if (!mon) throw new Error("Bad from mon in switch");

				const PassOption = new CommandOption(`pass`, mon);

				if (!mustSwitch) return [PassOption];

				const canSwitch = [1, 2, 3, 4, 5, 6].filter(i => (
					pokemon[i - 1] &&
					// not active
					i > request.forceSwitch.length &&
					// not chosen for a simultaneous switch
					!chosen.includes(i) &&
					// not fainted
					!pokemon[i - 1].condition.endsWith(` fnt`)
				));

				if (!canSwitch.length) return [PassOption];
				return canSwitch.map(t => {
					const targetSpecies = pokemon[t - 1].details.split(',')[0];
					const target = Dex.data.Pokedex[Dex.getId(targetSpecies)];
					return new SwitchOption(`switch ${t}`, mon, target, t);
				})
			});

			const choices = choiceOptions.map((cos, i) => {
				//make sure we don't switch to the same pokemon twice
				const validOptions = cos.filter(co => co instanceof SwitchOption && !chosen.includes(co.targetIndex));
				if (!validOptions.length) return `pass`;
				const choice = this.prng.sample(validOptions);
				if (choice instanceof SwitchOption) {
					chosen.push(choice.targetIndex);
				}
				return choice.command;
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

				// Filter out adjacentAlly moves if we have no allies left, unless they're our
				// only possible move options.
				const hasAlly = pokemon[i ^ 1] && !pokemon[i ^ 1].condition.endsWith(` fnt`);
				const filtered = canMove.filter(m => m.target !== `adjacentAlly` || hasAlly);
				canMove = filtered.length ? filtered : canMove;

				const idSep = pokemon[i].ident.indexOf(':')
				const id = pokemon[i].ident.substring(idSep + 2);
				const place = [Place.myA, Place.myB][i];
				const mon = this.placeToPokemonTemplate(place);
				const moveOptions = canMove.flatMap(m => this.getMoveChoices(place, m));

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


				const switchOptions: SwitchOption[] = switches.map((t: number) : SwitchOption => {
					const targetSpecies = pokemon[t - 1].details.split(',')[0];
					const target = Dex.data.Pokedex[Dex.getId(targetSpecies)];
					return new SwitchOption(`switch ${t}`, mon!, target, t);
				});
				
				//here is where we can apply our rule-based scoring for each option
				//and then sample based on the score

				const options = [...switchOptions, ...moveOptions];
				for (const o of options) {
					o.calcScore(this.battleState);
					//square to bias towards better options
					o.score *= o.score;
				}
				const scoreSum = options.reduce((acc, o) => acc + o.score, 0);
				const scores = options.map(o => o.score / scoreSum);
				let roll = this.prng.next();
				let option = options[0];
				while (roll > 0 && options.length) {
					option = options.shift()!;
					const score = scores.shift()!;
					roll -= score;
				}
				if (option instanceof SwitchOption) {
					chosen.push(option.targetIndex);
				}
				return option.command;
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