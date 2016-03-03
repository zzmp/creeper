var MINUTE = 60000;
var oldMode = Camera.getModeString();

Script.scriptEnding.connect(function() { Camera.setModeString(oldMode); });

run();

function run() { displayUsers() };

function getUsers(cb) {
    var req;
    poll();

    function poll() {
        var URL = 'https://metaverse.highfidelity.com/api/v1/users?status=online';

        req = new XMLHttpRequest();
        req.open("GET", URL, true);
        req.timeout = MINUTE;
        req.onreadystatechange = process;
        print('Requesting online users');
        req.send();
    }

    function process() {
        var res;
        if (req.readyState === req.DONE && req.status === 200) {
            print('Processing online users');

            res = JSON.parse(req.responseText).data.users;
            var me = GlobalServices.username;
            var users = [];
            for (var i = 0; i < res.length; i++) {
                var user = res[i];
                var name = user.username;
                if (name !== me && user.location && user.location.root && user.location.root.name && user.location.path) {
                    var pos = user.location.path.replace(/^\//,'').replace(/\/.*$/,'').split(',');
                    var position = { x: pos[0], y: pos[1], z: pos[2] };
                    var location = { domain:  user.location.root.name, position: position };
                    users.push({ name: name, location: location });
                }
            }
            cb(users);
        } else {
            print('Failed to fetch online users');
        }
    }
}

function displayUsers() {
    var display;
    var users;

    var viewport = Controller.getViewportDimensions();
    var overlayY = (viewport.y / 2) - 250;
    var lineHeight = 18;
    var MARGIN = 12;
    display = Overlays.addOverlay('text', {
        x: (viewport.x / 2) - 100, y: overlayY,
        width: 200, height: 500,
        topMargin: MARGIN, leftMargin: MARGIN,
        text: ''
    });
    Script.scriptEnding.connect(function() { Overlays.deleteOverlay(display); });

    getUsers(update);
    Script.setInterval(function() { usersFn(update); }, MINUTE / 2);

    Controller.mousePressEvent.connect(onClick);

    function onClick(e) {
        if (display !== Overlays.getOverlayAtPoint({ x: e.x, y: e.y })) return;
        var y = e.y - overlayY - MARGIN;
        var line = Math.round(y / 18) - 1;
        var user = users[line];
        if (user) {
            Overlays.editOverlay(display, { visible: false });
            creep(user, function() { Overlays.editOverlay(display, { visible: true }); });
        }
    }
    function update(data) {
        users = data;
        var text = [];
        for (var i = 0; i < users.length; i++) text.push(users[i].name);

        Overlays.editOverlay(display, { text: text.join('\n') });
    }
}

var creeping = false;
function creep(user, cb) {
    if (creeping) return;
    creeping = true;
    isEscaped(true); // reset the stopFn

    print('Creeping on ' + user.name);
    MyAvatar.setEnableMeshVisible(false);

    find(user, function(avatar) {
        // TODO: Follow users across domains

        if (!avatar) {
            finish();
        } else {
            var listener = listenerFn
            Script.update.connect(listener);

            function listenerFn() {
                if (isEscaped()) {
                    Script.update.disconnect(listenerFn);
                    finish();
                } else {
                    follow(avatar);
                }
            }
        }
    });

    function finish() {
        creeping = false;
        following = false;
        MyAvatar.audioListenerMode = MyAvatar.FROM_HEAD;
        Camera.setModeString(oldMode);
        MyAvatar.setEnableMeshVisible(true);
        location.goBack();
        print('Finished creeping');
        cb();
    }
}

function find(user, cb) {
    location.goToUser(user.name);

    // Get latest user info
    getUsers(update);

    function update(users) {
        for (var i = 0; i < users.length; i++) {
            if (user.name === users[i].name) {
                user = users[i];
                break;
            }
        }

        var avatars = AvatarManager.getAvatarIdentifiers();
        var avatar = null;
        var closest = 100;
        for (var i = 0; i < avatars.length; i++) {
            var id = avatars[i];
            if (!id || id === MyAvatar.sessionUUID) continue;

            var entity = AvatarManager.getAvatar(id);
            var distance = calculateDistance(user.location.position, entity.position);
            if (distance < closest) {
                closest = distance;
                avatar = entity;
            }
        }
        cb(avatar);
    }

    function calculateDistance(a, b) {
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        var dz = a.z - b.z;
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    }
}

var following = false;
var debug = 0;
function follow(avatar) {
    if (!following) {
        print('Creeping...');
        following = true;

        oldMode = Camera.getModeString();
        Camera.setModeString('entity');
        MyAvatar.audioListenerMode = MyAvatar.FROM_CAMERA;
    }

    var position = avatar.getJointPosition('RightEye');
    var orientation = avatar.orientation;

    if (position.x == 0 && position.y == 0 && position.z == 0) {
        // third person
        position = avatar.position;
    } else {
        // first person
        var headOrientation = avatar.headOrientation;
        // TODO: Apply head orientation
    }

    biasPosition(-0.05, orientation);

    Camera.setPosition(position);
    Camera.setOrientation(orientation);

    function biasPosition(bias, orientation) {
        bias = Vec3.multiplyQbyV(orientation, { x: bias, y: bias, z: bias });
        position.x += bias.x;
        position.y += bias.y;
        position.z += bias.z;
    }
}

var triggered = false;
function isEscaped(reset) {
    var isInit = false;
    if (!isInit) {
        Controller.keyPressEvent.connect(listener);
        function listener(e) { if (!e.isAutoRepeat && e.text == 'ESC') triggered = true; }
        isInit = true;
    }

    if (reset) triggered = false;

    return triggered;
}

