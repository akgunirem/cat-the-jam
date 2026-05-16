import random
from flask import Flask, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins = "*")
players = {}
coin = {"x": random.randint(0, 800), "y": random.randint(0, 600)}

@socketio.on('connect')
def	connection_established():
	players[request.sid] = {"x": 0, "y": 0, "score": 0}
	print(f"A new player has joined: {request.sid}")
	print(f"Current Players: {players}")
	emit('state_update', {"players": players, "coin": coin}, broadcast = True)

@socketio.on('player_movement')
def	handle_movement(data):
	players_id = request.sid
	if players_id in players:
		if data['x'] < 0:
			data['x'] = 0
		elif data['x'] > 800:
			data['x'] = 800
		if data['y'] < 0:
			data['y'] = 0
		elif data['y'] > 600:
			data['y'] = 600
		players[players_id]['x'] = data['x']
		players[players_id]['y'] = data['y']
		print(f"Motion detected {players_id} has moved to a new location.")
		print(f"Current Players: {players}")
		if abs(players[players_id]['x'] - coin['x']) < 20 and abs(players[players_id]['y'] - coin['y']) < 20:
			players[players_id]['score'] += 1
			print(f"BINGO! {players_id}. Skor: {players[players_id]['score']}")
			coin['x'] = random.randint(0, 800)
			coin['y'] = random.randint(0, 600)
		for other_id, other_player in players.items():
			if other_id != players_id:
				if abs(players[players_id]['x'] - other_player['x']) < 20 and abs(players[players_id]['y'] - other_player['y']) < 20:
					print(f"BAM! {players_id} -> {other_id}")
					if players[other_id]['score'] > 0:
						players[other_id]['score'] -= 1
						players[players_id]['score'] += 1
		emit('state_update', {"players": players, "coin": coin}, broadcast = True)
@socketio.on('disconnect')
def	connection_lost():
	if request.sid in players:
		del players[request.sid]
	print(f"One of the players left the server: {request.sid}")
	print(f"Current Players: {players}")
	emit('state_update', {"players": players, "coin": coin}, broadcast = True)


if __name__ == "__main__":
	socketio.run(app, host = '0.0.0.0', port = 5000)

