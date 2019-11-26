import {RoomBattleStream} from '../room-battle';
import { getPlayerStreams, BattleStream } from '../../sim/battle-stream';
import { BotRoomBattlePlayer } from './botroombattleplayer';

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
	}

	dump() {
		this.stream.write('>internal dump');
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

		if (this.gameType === 'multi') {
			this.room.title = `Team ${this.p1.name} vs. Team ${this.p2.name}`;
		} else if (this.gameType === 'free-for-all') {
			// p1 vs. p2 vs. p3 vs. p4 is too long of a title
			this.room.title = `${this.p1.name} and friends`;
		} else {
			this.room.title = `${this.p1.name} vs. ${this.p2.name}`;
		}
		this.room.send(`|title|${this.room.title}`)
	}

	async onEnd(winner: any) {
		await super.onEnd(winner);
		const winnerid = toID(winner);
		this._onEnd(winnerid !== 'guest bot')
	}
}