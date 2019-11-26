/*
* Hangman chat plugin
* By bumbadadabum and Zarel. Art by crobat.
*/

'use strict';

import {BattleFactoryRoomBattle} from './battlefactory-room-battle';

//import bssSets from '../../data/mods/gen7/bss-factory-sets.json'
const maxMistakes = 6;

class BattleFactory extends Rooms.RoomGame {
	gameNumber: Number;
	gameid: ID;
	player: User;
	battleRoom: GameRoom | null;
	battle: BattleFactoryRoomBattle | null;

	constructor(room: ChatRoom | GameRoom, user: User)  {

		super(room);
		this.gameNumber = ++room.gameNumber;
		this.gameid = 'battlefactory' as ID;
		this.title = 'Battle Factory';
		this.player = user;
		this.battleRoom = null;
		this.battle = null;
	}

	start() {
		const format = 'gen71v1';
		const roomid = Rooms.global.prepBattleRoom(format);
		const p1 = Users.get(this.player);
		//const p2 = Users.get("samhippie");
		const options = {
			p1: p1,
			//p2: p2,
			format: format,
			//p1team: '...'
			//p2team: '...'
		};
		this.battleRoom = Rooms.createGameRoom(roomid, "BF Room", options);
		this.battle = new BattleFactoryRoomBattle(this.battleRoom, format, options, (isWinner) => {
			this.displayPostGame(isWinner);
		});
		this.battleRoom.game = this.battle;

		p1 ? p1.joinRoom(this.battleRoom) : null;
		//p2 ? p2.joinRoom(this.battleRoom) : null;
	}

	dump() {
		this.battle!.dump();
	}

	displayPostGame(isWinner: boolean) {
		const output = `<p>You <strong>${isWinner ? 'Won' : 'Lost'}!</strong></p>`;
		this.player.sendTo(this.room, `|uhtml|battlefactory${this.gameNumber}|${output}`);
	}

	generateWindow() {
		const output = '<button name="send" value="/bf start">Start</button>'

		return output;
	}

	display(user: User, broadcast = false) {
		if (broadcast) {
			this.room.add(`|uhtml|battlefactory${this.gameNumber}|${this.generateWindow()}`);
		} else {
			user.sendTo(this.room, `|uhtml|battlefactory${this.gameNumber}|${this.generateWindow()}`);
		}
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
			const game = new BattleFactory(room, user);
			room.game = game;
			game.display(user, true);
			this.modlog('BATTLEFACTORY');
			this.addModAction(`A game of battle factory was started by ${user.name}.`);
		},

		start(target: string, room: ChatRoom | GameRoom, user: User) {
			const game = room.game as BattleFactory;
			game.start();
		},

		dump(target: string, room: ChatRoom | GameRoom, user: User) {
			const game = room.game as BattleFactory;
			game.dump();
		}
	},
};

exports.commands = commands;
