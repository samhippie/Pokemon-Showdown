import {RoomBattleStream, RoomBattlePlayer} from '../room-battle';
import { getPlayerStreams, BattleStream } from '../../sim/battle-stream';
import { BotRoomBattlePlayer } from './botroombattleplayer';
import { RoomGame } from '../room-game';

export class BattleFactoryRoomBattle extends Rooms.RoomBattle {
	botPlayer: BotRoomBattlePlayer;
	_onEnd: (isWinner: boolean) => void;

	constructor(room: GameRoom, formatid: string, options: AnyObject, onEnd: (isWinner: boolean) => void) {
		super(room, formatid, options);
		this.botPlayer = new BotRoomBattlePlayer(this);
		//dirty, taking advantage of the fact that 'guest...' names are illegal
		this.players[1] = this.botPlayer;
		this.playerTable['guest bot'] = this.botPlayer;
		this.p2 = this.botPlayer;
		this._start();
		console.log('starting bf battle room');
		this._onEnd = onEnd;

		//send (post-split) broadcast messages to bot
		Sockets.monkeyPatchChannelSocket(this.roomid, (msg) => {
			this.botPlayer.send(msg);
		});
	}

	dump() {
		this.stream.write('>internal dump');
	}

	//override so we can give the bot player a custom name
	addPlayer(user: User | null, team: string | null, rating = 0) {
		// TypeScript bug: no `T extends RoomGamePlayer`
		const player = RoomGame.prototype.addPlayer.call(this, user, team, rating) as RoomBattlePlayer;
		if (!player) return null;
		const slot = player.slot;
		this[slot] = player;

		if (team !== null) {
			const options = {
				name: slot === 'p2' ? 'Roboko' : player.name,
				avatar: slot === 'p2'? '120' : user ? '' + user.avatar : '',
				team,
				rating: Math.round(rating),
			};
			this.stream.write(`>player ${slot} ${JSON.stringify(options)}`);
		}

		if (user) this.room.auth[user.id] = Users.PLAYER_SYMBOL;
		if (user && user.inRooms.has(this.roomid)) this.onConnect(user);
		return player;
	}

	start() {
	}

	_start() {
		// on start
		this.started = true;
		const user = this.players[0].getUser()		
		if (!this.missingBattleStartMessage) {
			// @ts-ignore The above error should throw if null is found, or this should be skipped
			Rooms.global.onCreateBattleRoom([user], this.room, {rated: this.rated});
		}

		this.room.title = `${this.p1.name} IN THE BATTLE FACTORY`;

		this.room.send(`|title|${this.room.title}`)
	}

	async onEnd(winner: any) {
		await super.onEnd(winner);
		const winnerid = toID(winner);
		this._onEnd(winnerid === this.p1.id)
	}
}