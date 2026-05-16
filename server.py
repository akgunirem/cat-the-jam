import random
from math import hypot
from flask import Flask, request
import requests
from flask_socketio import SocketIO, emit, join_room, disconnect

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins = "*")
players = {}
coin = {"x": random.randint(0, 800), "y": random.randint(0, 600)}

ITEM_POWER = {'towel': 3, 'cup': 2, 'cardholder': 1}
ITEM_POOL = [('cardholder', 60), ('cup', 30), ('towel', 10)]

def distance(p1, p2):
    return hypot(p1['x'] - p2['x'], p1['y'] - p2['y'])

def award_item_to_player(sid):
    if sid not in players:
        return
    item = choose_item()
    players[sid]['item'] = item
    socketio.emit('you_got_item', {"sid": sid, "item": item}, room=sid)

def resolve_combat(att_sid, def_sid):
    # ignore if same coalition or same sid
    if att_sid == def_sid:
        return
    A = players.get(att_sid)
    B = players.get(def_sid)
    if not A or not B:
        return
    if A.get('coalitionId') and A['coalitionId'] == B.get('coalitionId'):
        return  # müttefiklere zarar yok

    a_item = A.get('item')
    b_item = B.get('item')
    # hiçbirinin eşyası yoksa basit: attacker gains small score
    if not a_item and not b_item:
        A['score'] += 0  # isteğe bağlı: küçük hasar veya skip
        return

    a_power = ITEM_POWER.get(a_item, 0)
    b_power = ITEM_POWER.get(b_item, 0)

    if a_power > b_power:
        # defender'nin eşyasını yok et, attacker puan alır
        B['item'] = None
        A['score'] += 1
        socketio.emit('combat_result', {"winner": att_sid, "loser": def_sid, "item_removed": True}, broadcast=True)
    elif a_power < b_power:
        A['item'] = None
        B['score'] += 1
        socketio.emit('combat_result', {"winner": def_sid, "loser": att_sid, "item_removed": True}, broadcast=True)
    else:
        # eşit güç => her ikisi de eşyasını kaybeder
        A['item'] = None
        B['item'] = None
        socketio.emit('combat_result', {"winner": None, "loser": None, "item_removed": True}, broadcast=True)

def	choose_item():
    items, weights = zip(*ITEM_POOL)
    return random.choices(items, weights=weights, k=1)[0]


def verify_token_with_node(token):
    if not token:
        return None
    try:
        r = requests.post('http://localhost:3000/verify-token', json={'token': token}, timeout=2)
        if r.status_code == 200:
            j = r.json()
            if j.get('ok'):
                return j.get('payload')
    except Exception as e:
        print('Token verify error:', e)
    return None


@socketio.on('authenticate')
def handle_auth(data):
    token = None
    if isinstance(data, dict):
        token = data.get('token')
    else:
        token = data
    payload = verify_token_with_node(token)
    if not payload:
        emit('auth_denied', {'reason': 'invalid token'})
        try:
            disconnect()
        except Exception:
            pass
        return

    sid = request.sid
    if sid not in players:
        players[sid] = {
            "user": None,
            "x": 0,
            "y": 0,
            "score": 0,
            "coalitionId": None,
            "item": None,
            "alive": True
        }
    # attach user id to player and assign coalition
    user_id = payload.get('sub') or payload.get('email')
    players[sid]['user'] = user_id
    coalition = f"coalition_{abs(hash(user_id)) % 3}"
    players[sid]['coalitionId'] = coalition
    join_room('coalition:' + coalition)
    emit('auth_ok', {'user': user_id, 'coalitionId': coalition}, room=sid)
    socketio.emit('state_update', {"players": players, "coin": coin}, broadcast=True)

@socketio.on('connect')
def	connection_established():
	players[request.sid] = {
		"user": None,
		"x": 0, "y": 0,
		"score": 0,
		"coalitionId": None,
		"item": None,
		"alive": True
		}
	print(f"A new player has joined: {request.sid}")
	print(f"Current Players: {players}")
	emit('state_update', {"players": players, "coin": coin}, broadcast = True)

@socketio.on('player_movement')
def handle_movement(data):
    sid = request.sid
    p = players.get(sid)
    if not p:
        return
    # clamp pozisyon
    p['x'] = max(0, min(800, data.get('x', p['x'])))
    p['y'] = max(0, min(600, data.get('y', p['y'])))
    # 1) mission point / coin toplama kontrolü (örnek coin)
    if abs(p['x'] - coin['x']) < 20 and abs(p['y'] - coin['y']) < 20:
        # coin toplandı -> ödül ver ve coin yeniden spawnla
        award_item_to_player(sid)
        coin['x'] = random.randint(0, 800)
        coin['y'] = random.randint(0, 600)

    # 2) diğer oyuncularla çarpışma kontrolü
    for other_sid, other in list(players.items()):
        if other_sid == sid:
            continue
        if distance(p, other) < 30:  # yakınlık threshold
            # koalisyon kontrolü inside resolve_combat
            resolve_combat(sid, other_sid)

    # 3) broadcast güncellemesi
    emit('state_update', {"players": players, "coin": coin}, broadcast=True)

@socketio.on('disconnect')
def	connection_lost():
	if request.sid in players:
		del players[request.sid]
	print(f"One of the players left the server: {request.sid}")
	print(f"Current Players: {players}")
	emit('state_update', {"players": players, "coin": coin}, broadcast = True)


@socketio.on('coalition_chat')
def handle_coalition_chat(data):
    sid = request.sid
    p = players.get(sid)
    if not p:
        return
    coalition = p.get('coalitionId')
    if not coalition:
        emit('chat_error', {'reason': 'not authenticated'})
        return

    text = ''
    if isinstance(data, dict):
        text = str(data.get('message', '')).strip()
    else:
        text = str(data).strip()

    if not text:
        return

    socketio.emit(
        'coalition_chat',
        {
            'from': p.get('user') or sid,
            'coalitionId': coalition,
            'message': text[:240]
        },
        room='coalition:' + coalition
    )


if __name__ == "__main__":
	socketio.run(app, host = '0.0.0.0', port = 5000)

