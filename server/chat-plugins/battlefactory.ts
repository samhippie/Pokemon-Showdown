
import {BattleFactoryRoomBattle} from './battlefactory-room-battle';
//normal ts-style `import` just sets bssSets to `undefined` for some reason
const bssSets: Record<string, any> = require('../../data/mods/gen7/bss-factory-sets.json');
import {Dex} from '../../sim/dex';
import { User } from '../users';

class BattleFactory extends Rooms.RoomGame {
	gameNumber: Number;
	gameid: ID;
	player: User;
	battleRoom: GameRoom | null;
	battle: BattleFactoryRoomBattle | null;
	newMons: PokemonSet[];
	team: PokemonSet[];
	oppTeam: PokemonSet[];
	monToRemove: number | null;

	constructor(room: ChatRoom | GameRoom, user: User)  {

		super(room);
		this.gameNumber = ++room.gameNumber;
		this.gameid = 'battlefactory' as ID;
		this.title = 'Battle Factory';
		this.player = user;
		this.battleRoom = null;
		this.battle = null;
		this.newMons = sampleMons(6);
		this.team = [];
		this.oppTeam = sampleMons(3, this.newMons.map(m => m.species));
		this.monToRemove = null;
	}

	/**
	 * For after a user has played a game and chose to play again
	 */
	continue() {
		this.oppTeam = sampleMons(3, this.newMons.map(m => m.species).concat(this.team.map(m => m.species)));
		console.log(this);
		this.displayPickToRemove();
	}

	start() {
		if (this.team.length < 3) return;
		const format = 'sambattlefactory';
		const roomid = Rooms.global.prepBattleRoom(format);
		const p1 = Users.get(this.player);
		this.newMons = this.oppTeam.slice();
		console.log(this.team[0].moves);
		const options: AnyObject = {
			p1: p1,
			format: format,
			p1team: Dex.packTeam(this.team),
			p2team: Dex.packTeam(this.oppTeam),
		};
		this.battleRoom = Rooms.createGameRoom(roomid, "BF Room", options);
		this.battle = new BattleFactoryRoomBattle(this.battleRoom, format, options, (isWinner) => {
			this.displayPostGame(isWinner);
		});
		this.battleRoom.game = this.battle;

		p1 ? p1.joinRoom(this.battleRoom) : null;

		this.displayInGame();
	}

	pickToRemove(monIndex: number | null) {
		if (monIndex === null) {
			this.start();
			return;
		}
		this.monToRemove = monIndex;
		this.displayPickOpponent();
	}

	pickOpponent(monIndex: number) {
		const mon = this.newMons[monIndex]
		if (this.team.find(m => m.species === mon.species)) return;
		this.team[this.monToRemove!] = mon;
		this.start();
	}

	pickInitial(monIndex: number) {
		const mon = this.newMons[monIndex]
		if (this.team.find(m => m.species === mon.species)) return;
		this.team.push(mon);
		if (this.team.length > 3) {
			this.team.shift();
		}
		this.displayPickTeam();
	}

	dump() {
		this.battle!.dump();
	}

	renderTeamSummary() : string {
		return `<p>Your current team: ${this.team.map(m => m.species).join(', ')}</p>`;
	}

	renderPickTeam() : string {
		let team = '<ul>';
		let i = 0;
		for(const mon of this.newMons) {
			team += '<li><button '
			if (this.team.find(m => m.species == mon.species)) {
				team += 'disabled ';
			}
			team += `name="send" value="/bf pick ${i}"><strong>${mon.species}</strong> (${mon.item}) <ul style="text-align: left;">${mon.moves.map(m => `<li>${m}</li>`).join('')}</ul></button></li>`;
			i++;
		}
		team += '</ul>'
		return team;
	}

	renderStartGame() {
		return '<button name="send" value="/bf start">Start</button>';
	}

	displayInGame() {
		let output = `<strong>GO GO GO GO GO ${this.player.name}</strong>`;
		this.displayHtml(output);
	}

	displayPickToRemove() {
		let output = 'Pick a mon to remove <ul>'
		let i = 0;
		for (const mon of this.team) {
			output += `<li><button name="send" value="/bf remove ${i}">Remove <strong>${mon.species}</strong></button></li>`
			i++;
		}
		output += `<li><button name="send" value="/bf remove null">Remove nothing</button></li>`
		output += '</ul>'
		output += `Potential new mons: ${this.newMons.map(m => m.species).join(', ')}`
		this.displayHtml(output);
	}

	displayPickOpponent() {
		let output = `Pick a mon to replace ${this.team[this.monToRemove!].species} with<ul>`
		let i = 0;
		for (const mon of this.newMons) {
			output += `<li><button name="send" value="/bf replace ${i}">Pick <strong>${mon.species}</strong></button></li>`
			i++;
		}
		output += '</ul>'
		output += `Current team: ${this.team.filter((_, i) => i != this.monToRemove).map(m => m.species).join(', ')}`
		this.displayHtml(output);
	}

	displayPickTeam() {
		let output = this.renderPickTeam();
		if (this.team.length > 0) {
			output += this.renderTeamSummary();
		}
		output += this.renderStartGame();
		this.displayHtml(output);
	}

	displayPostGame(isWinner: boolean) {
		let output = `<p>You <strong>${isWinner ? 'Won' : 'Lost'}!</strong></p>`;
		if (isWinner) {
			output += '<button name="send" value="/bf continue">Continue</button>'
		} else {
			output += '<button disabled name="send" value="/bf continue">Continue</button>'
		}
		this.displayHtml(output);
	}

	displayHtml(html: string) {
		this.player.sendTo(this.room, `|uhtml|battlefactory${this.gameNumber}|${html}`);
	}

	update() {
	}

	end() {
		delete this.room.game;
	}

	finish() {
		delete this.room.game;
	}
}

/** @type {ChatCommands} */
const commands = {
	bf: 'battlefactory',
	battlefactory: {
		create: 'new',
		new(target: string, room: ChatRoom | GameRoom, user: User, connection: Connection) {
			const format = 'sambattlefactory';
			const gameRoomId = Rooms.global.prepBattleRoom(format);
			const p1 = Users.get(user);
			const gameRoom = Rooms.createChatRoom(gameRoomId, 'Battle Factory', { p1: p1 });
			p1 ? p1.joinRoom(gameRoom) : null;
			const game = new BattleFactory(gameRoom, user);
			gameRoom.game = game;
			game.displayPickTeam();
			this.modlog('BATTLEFACTORY');
			this.addModAction(`A game of battle factory was started by ${user.name}.`);
		},

		start(target: string, room: ChatRoom | GameRoom, user: User) {
			const game = room.game as BattleFactory;
			if (user.id != game.player.id) return;
			if (game.battle) return;
			game.start();
		},

		pick(target: string, room: ChatRoom | GameRoom, user: User) {
			const game = room.game as BattleFactory;
			if (user.id != game.player.id) return;
			const monIndex = parseInt(target);
			game.pickInitial(monIndex);
		},

		continue(target: string, room: ChatRoom | GameRoom, user: User) {
			const game = room.game as BattleFactory;
			if (user.id != game.player.id) return;
			game.continue();
		},

		remove(target: string, room: ChatRoom | GameRoom, user: User) {
			const game = room.game as BattleFactory;
			if (user.id != game.player.id) return;
			const monIndex = target !== 'null'
				? parseInt(target)
				: null;
			game.pickToRemove(monIndex);
		},

		replace(target: string, room: ChatRoom | GameRoom, user: User) {
			const game = room.game as BattleFactory;
			if (user.id != game.player.id) return;
			const monIndex = parseInt(target);
			game.pickOpponent(monIndex);
		},

		dump(target: string, room: ChatRoom | GameRoom, user: User) {
			const game = room.game as BattleFactory;
			game.dump();
		},
	},
};

const sets: PokemonSet[] = [];

/**
 *  If you ask for an impossible number of mons given the sets and blacklist, this is going to run forever
 */ 
function sampleMons(n: number, speciesBlacklist: string[] = []) {
	if (sets.length === 0) {
		const mons = Object.keys(bssSets);
		for (const mon of mons) {
			sets.push(...bssSets[mon].sets);
		}
		for (const set of sets) {
			//each move in json is actually an array of moves
			//we could pick one randomly, but this is easier. It also avoids doing illegal things like having the same move multiple times on the same set
			set.moves = set.moves.map(ms => ms[0]);
		}
	}
	const mons: PokemonSet[] = [];
	while (mons.length < n) {
		const i = Math.floor(Math.random() * sets.length);
		const mon = sets[i];
		if (!speciesBlacklist.includes(mon.species) && !mons.find(m => m.species === mon.species)) {
			mons.push(mon);
		}
	}
	if (Math.random() < 0.1) {
		const i = Math.floor(Math.random() * mons.length);
		mons[i].shiny = true;
	}
	return mons;
}

exports.commands = commands;
