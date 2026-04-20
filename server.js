var fs = require('fs');
var express = require('express');
var bodyParser = require('body-parser');

var DB_FILE = 'database.json';
var app = express();

function generateUniqueId(prefix) {
    var randomStr = Math.random().toString(36).substring(2, 9);
    return prefix + "_" + Date.now() + "_" + randomStr;
}

function read() {
    try {
        var data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (!data.subscriptions) data.subscriptions = [];
        if (!data.users) data.users = [];
        return data;
    } catch (e) {
        return { users: [], products: [], sales: [], supply: [], invoices: [], chat: [], employees: [], deliveries: [], subscriptions: [] };
    }
}

function save(d) {
    fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));
}

function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        var base = { users: [], products: [], sales: [], supply: [], invoices: [], chat: [], employees: [], deliveries: [], subscriptions: [] };
        fs.writeFileSync(DB_FILE, JSON.stringify(base, null, 2));
        console.log("✅ Fichier base de données créé.");
    }
}
initDB();

app.use(bodyParser.json({ limit: '100mb' }));
app.use(express.static('public'));
app.use(express.static(__dirname));

app.post('/api/heartbeat', function (req, res) {
    var db = read();
    var u = db.users.find(function (x) { return x.user === req.body.user; });
    if (u) { u.lastActive = Date.now(); save(db); }
    res.json({ success: true });
});

app.post('/api/subscribe', function (req, res) {
    var db = read();
    var u = db.users.find(function (x) { return x.user === req.body.user; });
    if (u) {
        u.isPremium = true;
        db.subscriptions.push({
            id: generateUniqueId("SUB"), user: u.user, role: u.role, amount: req.body.amount || 10000, date: new Date().toLocaleString('fr-FR')
        });
        save(db);
        res.json({ success: true, user: u });
    } else res.json({ success: false });
});

app.get('/api/gerant/data', function (req, res) {
    var db = read();
    var now = Date.now();
    var usersData = db.users.map(function (u) {
        return { user: u.user, role: u.role, shop: u.shop || "N/A", isPremium: !!u.isPremium, isActive: (now - (u.lastActive || 0)) < 15000 };
    });
    res.json({ users: usersData, subscriptions: db.subscriptions, chat: db.chat, sales: db.sales, deliveries: db.deliveries, products: db.products });
});

app.post('/api/gerant/action', function (req, res) {
    var db = read();
    var u = db.users.find(function (x) { return x.user === req.body.user; });
    if (u) {
        if (req.body.action === 'revoke') u.isPremium = false;
        if (req.body.action === 'ban') db.users = db.users.filter(function (x) { return x.user !== u.user; });
        save(db);
    }
    res.json({ success: true });
});

app.post('/api/gerant/chat', function (req, res) {
    var db = read();
    db.chat.push({ sender: 'GÉRANT', dest: 'ALL', text: req.body.text, date: new Date().toLocaleString('fr-FR') });
    save(db); res.json({ success: true });
});

app.post('/api/auth', function (req, res) {
    var db = read();
    var u = db.users.find(function (x) { return x.user === req.body.user && x.pass === req.body.pass; });
    if (u) {
        u.lastActive = Date.now(); save(db);
        res.json({ success: true, user: u });
    } else res.json({ success: false });
});

app.post('/api/signup', function (req, res) {
    var db = read();
    if (db.users.find(function (u) { return u.user === req.body.user; })) return res.json({ success: false });
    var uniqueId = generateUniqueId("USER");
    var newUser = Object.assign({}, req.body, { id: uniqueId, isPremium: false, lastActive: Date.now() });
    db.users.push(newUser);
    save(db);
    res.json({ success: true, user: newUser });
});

app.get('/api/data', function (req, res) { res.json(read()); });

app.post('/api/action', function (req, res) {
    var db = read();
    var type = req.body.type;
    var data = req.body.data;
    var now = new Date().toLocaleString('fr-FR');

    if (type === 'sale') {
        var total = 0;
        data.cart.forEach(function (item) {
            var prod = db.products.find(function (x) { return x.id === item.id; });
            if (prod && prod.stock > 0) { prod.stock--; total += parseInt(prod.price); }
        });

        if (data.deliverySpeed === 'rapide') total += 2000;
        if (data.deliverySpeed === 'ultra') total += 5000;

        var saleId = generateUniqueId("VENTE");
        var newSale = Object.assign({}, data, { id: saleId, amount: total, date: now });
        db.sales.push(newSale);

        let itemsNames = data.cart.map(p => p.name).join(", ");
        db.invoices.push({ id: generateUniqueId("FAC"), type: 'VENTE', owner: data.owner, client: data.client, amount: total, details: itemsNames, date: now });
    }

    if (type === 'add_prod') {
        data.id = generateUniqueId("PROD");
        db.products.push(data);
    }

    if (type === 'del_prod') { db.products = db.products.filter(function (p) { return p.id !== data.id; }); }
    if (type === 'chat') { db.chat.push(Object.assign({}, data, { date: now })); }
    if (type === 'add_emp') { data.id = generateUniqueId("EMP"); data.jobs = 0; db.employees.push(data); }
    if (type === 'del_emp') { db.employees = db.employees.filter(function (e) { return e.name !== data.name; }); }

    if (type === 'supply') {
        var prod = db.products.find(function (x) { return x.id === data.pid; });
        if (prod) {
            prod.stock = parseInt(prod.stock) + parseInt(data.qty);
            db.invoices.push({ type: 'ACHAT_STOCK', owner: data.owner, amount: data.total, details: "Réappro de " + data.qty + "x " + prod.name, date: now });
        }
    }

    if (type === 'pay_salary') {
        db.invoices.push({ type: 'SALAIRE', owner: data.owner, amount: data.amount, details: "Paye de " + data.empName, date: now });
        var emp = db.employees.find(function (e) { return e.name === data.empName; });
        if (emp) emp.jobs = 0;
    }

    if (type === 'assign') {
        var venteParent = db.sales.find(function (s) { return s.id === data.orderId; });
        var vitesse = venteParent ? (venteParent.deliverySpeed || 'standard') : 'standard';

        db.deliveries.push({
            id: generateUniqueId("LIV"),
            orderId: data.orderId,
            livreur: data.livreur,
            loc: data.loc,
            owner: data.owner,
            status: 'EN_COURS',
            speed: vitesse,
            startTime: Date.now()
        });
        var emp = db.employees.find(function (e) { return e.name === data.livreur; });
        if (emp) { emp.jobs = (emp.jobs || 0) + 1; }
    }

    save(db);
    res.json({ success: true });
});

app.post('/api/root/reset', (req, res) => {
    var db = read();
    db.sales = []; db.products = []; db.invoices = []; db.chat = []; db.deliveries = []; db.supply = [];
    save(db);
    res.json({ success: true });
});

app.post('/api/root/delete-users', (req, res) => {
    var db = read();
    db.users = []; db.subscriptions = []; db.employees = [];
    save(db);
    res.json({ success: true });
});

var PORT = 4000;
app.listen(PORT, function () {
    console.log("------------------------------------------");
    console.log("🚀 EMPIRE DASHBOARD READY SUR LE PORT " + PORT);
    console.log("------------------------------------------");
});
