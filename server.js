var express = require('express');
var mongoose = require('mongoose');
var http = require('http');
var socketIo = require('socket.io');
var bodyParser = require('body-parser');
var cors = require('cors');
var path = require('path');

var app = express();
var server = http.createServer(app);
var io = socketIo(server);

app.use(cors());
app.use(bodyParser.json());
app.use('/photos', express.static(path.join(__dirname, 'photos')));

mongoose.connect('mongodb://localhost:27017/madamarket_v6', { useMongoClient: true });
mongoose.Promise = global.Promise;

// --- SCHEMAS ---
var User = mongoose.model('User', { 
    username: { type: String, unique: true }, 
    password: { type: String, required: true },
    role: String, entreprise: String, payNum: String 
});

var Product = mongoose.model('Product', { 
    name: String, price: Number, qty: Number, image: String, vendor: String, vendorId: String 
});

var Sale = mongoose.model('Sale', { 
    saleCode: String, vendorId: String, total: Number, productName: String, 
    clientName: String, address: String, payMethod: String,
    deliveryDate: String, deliveryTime: String, deliveryPhone: String,
    date: { type: Date, default: Date.now } 
});

// --- TCHAT ---
io.on('connection', function(socket) {
    socket.on('send_msg', function(data) { io.emit('receive_msg', data); });
});

// --- API ---
app.post('/api/register', function(req, res) {
    new User(req.body).save().then(function(u){ res.json(u); }).catch(function(){ res.status(400).send("Erreur"); });
});

app.post('/api/login', function(req, res) {
    User.findOne({ username: req.body.username, password: req.body.password }).then(function(u) {
        if(u) res.json(u); else res.status(401).send("Erreur");
    });
});

app.get('/api/products', function(req, res) {
    Product.find({}).then(function(p){ res.json(p); });
});

app.post('/api/products', function(req, res) {
    new Product(req.body).save().then(function(p){ res.json(p); });
});

app.delete('/api/products/:id', function(req, res) {
    Product.remove({ _id: req.params.id }).then(function(){ res.json({ok:true}); });
});

app.get('/api/admin/dashboard/:id', function(req, res) {
    Sale.find({ vendorId: req.params.id }).sort({date: -1}).then(function(sales) {
        var total = 0; sales.forEach(function(s){ total += s.total; });
        res.json({ total: total, history: sales });
    });
});

app.post('/api/checkout', function(req, res) {
    var data = req.body;
    data.saleCode = 'INV-' + Math.floor(100000 + Math.random() * 899999);
    Product.update({ _id: data.productId }, { $inc: { qty: -1 } }).then(function(){
        new Sale(data).save().then(function(s){ res.json(s); });
    });
});

// --- INTERFACE ---
app.get('/', function(req, res) {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MADA MARKET V6 - ULTIME</title>
    <script src="https://cdn.jsdelivr.net/npm/vue@2.6.14"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/axios/0.19.2/axios.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        :root { --gold: #d4af37; --dark: #0a0a0a; --card: #1a1a1a; --txt: #e0e0e0; }
        body { font-family: 'Segoe UI', sans-serif; margin: 0; background: var(--dark); color: var(--txt); }
        .nav { background: #000; padding: 15px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--gold); position: sticky; top:0; z-index:100; }
        .container { max-width: 1100px; margin: auto; padding: 15px; }
        .card { background: var(--card); border-radius: 10px; padding: 15px; border: 1px solid #333; margin-bottom: 15px; }
        .input { width: 100%; padding: 12px; border: 1px solid #444; border-radius: 5px; margin: 5px 0; background: #222; color: white; box-sizing: border-box; }
        .btn { background: var(--gold); color: black; border: none; padding: 12px; border-radius: 5px; cursor: pointer; width: 100%; font-weight: bold; }
        .btn-refresh { background: #27ae60; color: white; margin-bottom: 15px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px; }
        .prod-card { background: var(--card); border-radius: 8px; border: 1px solid #333; overflow: hidden; }
        .prod-card img { width: 100%; height: 150px; object-fit: cover; }
        .overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); display:flex; align-items:center; justify-content:center; z-index:1000; padding:10px; }
        .invoice-box { background: white; color: black; padding: 25px; width: 320px; font-family: monospace; border-radius: 5px; }
        .chat-b { position: fixed; bottom: 20px; right: 20px; width: 50px; height: 50px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: black; cursor: pointer; z-index: 500; font-size: 24px; }
        .chat-w { position: fixed; bottom: 80px; right: 20px; width: 300px; height: 400px; background: var(--card); border: 1px solid var(--gold); border-radius: 10px; display: flex; flex-direction: column; z-index: 500; overflow: hidden; }
    </style>
</head>
<body>
<div id="app">
    <div class="nav">
        <b style="color:var(--gold)">MADA MARKET ELITE V6</b>
        <button v-if="user" @click="user=null" style="color:gray; background:none; border:none;">Sortir</button>
    </div>

    <div class="container">
        <div v-if="!user" class="card" style="max-width:350px; margin: 50px auto">
            <h2 style="text-align:center; color:var(--gold)">CONNEXION</h2>
            <select v-if="isReg" v-model="form.role" class="input">
                <option value="client">Client (Acheteur)</option>
                <option value="admin">Admin (Vendeur)</option>
            </select>
            <input v-model="form.username" class="input" placeholder="Utilisateur">
            <input v-model="form.password" type="password" class="input" placeholder="Mot de passe">
            <div v-if="isReg && form.role=='admin'">
                <input v-model="form.entreprise" class="input" placeholder="Nom Boutique">
                <input v-model="form.payNum" class="input" placeholder="N° Mobile Money">
            </div>
            <button class="btn" @click="isReg ? register() : login()">{{ isReg ? 'Créer Compte' : 'Se Connecter' }}</button>
            <p @click="isReg = !isReg" style="text-align:center; cursor:pointer; color:var(--gold); font-size:12px; margin-top:10px">Changer de mode</p>
        </div>

        <div v-if="user && user.role=='client'">
            <div class="card" style="display:flex; gap:10px; flex-wrap:wrap">
                <input v-model="search" class="input" style="flex:1; margin:0" placeholder="Rechercher un produit ou boutique...">
                <select v-model="sortPrice" class="input" style="width:150px; margin:0">
                    <option value="">Trier par prix</option>
                    <option value="asc">Croissant</option>
                    <option value="desc">Décroissant</option>
                </select>
                <button class="btn" style="width:auto" @click="refresh">🔄</button>
            </div>
            <div class="grid">
                <div class="prod-card" v-for="p in filteredProducts">
                    <img :src="p.image || 'https://via.placeholder.com/150'">
                    <div style="padding:10px">
                        <div style="color:var(--gold); font-size:11px; font-weight:bold; text-transform:uppercase">{{p.vendor}}</div>
                        <div style="font-weight:bold; font-size:14px; margin:4px 0">{{p.name}}</div>
                        <div style="color:#fff; font-size:16px; font-weight:900">{{p.price}} Ar</div>
                        <button class="btn" style="padding:5px; margin-top:8px; font-size:12px" @click="openOrder(p)" :disabled="p.qty<=0">ACHETER</button>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="user && user.role=='admin'">
            <div class="card" style="text-align:center; border: 2px solid var(--gold)">
                <small>CHIFFRE D'AFFAIRES TOTAL</small>
                <h1 style="color:var(--gold); margin:5px 0">{{stats.total}} Ar</h1>
                <button class="btn btn-refresh" @click="refresh">ACTUALISER LES DONNÉES</button>
            </div>

            <div class="card">
                <h3>Ajouter un Article</h3>
                <input v-model="newP.name" class="input" placeholder="Nom produit">
                <input v-model="newP.price" type="number" class="input" placeholder="Prix">
                <input v-model="newP.qty" type="number" class="input" placeholder="Quantité">
                <input v-model="newP.image" class="input" placeholder="Image URL / Chemin">
                <button class="btn" @click="addProd">METTRE EN VENTE</button>
            </div>

            <div class="card">
                <h3>📦 Mon Stock</h3>
                <div v-for="p in products" v-if="p.vendorId == user._id" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #333">
                    <span>{{p.name}} (Stock: {{p.qty}})</span>
                    <button class="btn" style="width:auto; background:red; padding:2px 8px; font-size:10px" @click="delProd(p._id)">SUPPRIMER</button>
                </div>
            </div>

            <div class="card">
                <h3>📜 Historique & Factures Vendeur</h3>
                <div v-for="s in stats.history" style="padding:10px; background:#111; margin-bottom:10px; border-radius:5px">
                    <div style="display:flex; justify-content:space-between">
                        <b>{{s.productName}}</b>
                        <button @click="printInv(s)" style="background:none; border:1px solid var(--gold); color:var(--gold); font-size:10px; cursor:pointer">VOIR FACTURE</button>
                    </div>
                    <small>Client: {{s.clientName}} | Date: {{new Date(s.date).toLocaleDateString()}}</small>
                </div>
            </div>
        </div>
    </div>

    <div v-if="order" class="overlay">
        <div class="card" style="width:330px">
            <h3 style="color:var(--gold)">INFOS LIVRAISON</h3>
            <label><small>Date livraison souhaitée:</small></label>
            <input v-model="delivery.date" type="date" class="input">
            <label><small>Heure livraison souhaitée:</small></label>
            <input v-model="delivery.time" type="time" class="input">
            <input v-model="delivery.phone" class="input" placeholder="Téléphone pour livraison">
            <input v-model="delivery.address" class="input" placeholder="Adresse précise">
            <select v-model="payMethod" class="input">
                <option value="Mobile Money">Mobile Money</option>
                <option value="Cash">Paiement à la livraison</option>
            </select>
            <button class="btn" @click="confirmOrder">VALIDER LA COMMANDE</button>
            <button @click="order=null" class="btn" style="background:gray; margin-top:5px">ANNULER</button>
        </div>
    </div>

    <div v-if="invoice" class="overlay">
        <div style="text-align:center">
            <div id="facture" class="invoice-box">
                <h2 style="margin:0">MADA MARKET</h2>
                <small>Boutique: {{invoice.vendorName || user.entreprise}}</small>
                <p>----------------------------</p>
                <b>FACTURE #{{invoice.saleCode}}</b>
                <p style="text-align:left; font-size:12px">
                    Client: {{invoice.clientName}}<br>
                    Article: {{invoice.productName}}<br>
                    Date Liv: {{invoice.deliveryDate}}<br>
                    Heure Liv: {{invoice.deliveryTime}}<br>
                    Tél: {{invoice.deliveryPhone}}<br>
                    Pay: {{invoice.payMethod}}
                </p>
                <p>----------------------------</p>
                <h2 style="margin:10px 0">{{invoice.total}} Ar</h2>
                <small>{{new Date(invoice.date).toLocaleString()}}</small>
            </div>
            <button class="btn" style="margin-top:10px" @click="downloadInv">TÉLÉCHARGER PNG</button>
            <button class="btn" style="margin-top:5px; background:none; color:white" @click="invoice=null">FERMER</button>
        </div>
    </div>

    <div v-if="user" class="chat-b" @click="showChat=!showChat">💬</div>
    <div v-if="showChat" class="chat-w">
        <div style="background:var(--gold); color:black; padding:10px; font-weight:bold">TCHAT SUPPORT</div>
        <div id="chatbox" style="flex:1; padding:10px; overflow-y:auto; font-size:12px">
            <div v-for="m in messages" :style="m.u == user.username ? 'text-align:right' : ''">
                <div :style="m.u == user.username ? 'background:var(--gold); color:black; padding:5px; border-radius:5px; display:inline-block; margin:2px' : 'background:#333; padding:5px; border-radius:5px; display:inline-block; margin:2px'">
                    <b>{{m.u}}:</b> {{m.t}}
                </div>
            </div>
        </div>
        <input v-model="msg" @keyup.enter="sendMsg" class="input" style="border-radius:0" placeholder="Message...">
    </div>
</div>

<script>
    var socket = io();
    new Vue({
        el: '#app',
        data: {
            user: null, isReg: false, products: [], stats: {total:0, history:[]},
            form: {username:'', password:'', role:'client', entreprise:'', payNum:''},
            newP: {name:'', price:0, qty:0, image:''},
            order: null, invoice: null, payMethod: 'Mobile Money', search: '', sortPrice: '',
            delivery: {date:'', time:'', address:'', phone:''},
            showChat: false, messages: [], msg: ''
        },
        computed: {
            filteredProducts: function() {
                var self = this;
                var list = this.products.filter(function(p){
                    return p.name.toLowerCase().includes(self.search.toLowerCase()) || p.vendor.toLowerCase().includes(self.search.toLowerCase());
                });
                if(this.sortPrice === 'asc') list.sort((a,b) => a.price - b.price);
                if(this.sortPrice === 'desc') list.sort((a,b) => b.price - a.price);
                return list;
            }
        },
        methods: {
            login: function() { 
                var self = this;
                axios.post('/api/login', this.form).then(function(r){ self.user = r.data; self.refresh(); });
            },
            register: function() { 
                var self = this;
                axios.post('/api/register', this.form).then(function(r){ self.user = r.data; self.refresh(); });
            },
            refresh: function() {
                var self = this;
                axios.get('/api/products').then(function(r){ self.products = r.data; });
                if(this.user && this.user.role=='admin') axios.get('/api/admin/dashboard/'+this.user._id).then(function(r){ self.stats = r.data; });
            },
            addProd: function() {
                var p = {...this.newP, vendor: this.user.entreprise, vendorId: this.user._id};
                axios.post('/api/products', p).then(() => { this.refresh(); this.newP={name:'',price:0,qty:0,image:''}; });
            },
            delProd: function(id) {
                if(confirm("Supprimer ?")) axios.delete('/api/products/'+id).then(() => this.refresh());
            },
            openOrder: function(p) { this.order = p; },
            confirmOrder: function() {
                var self = this;
                var d = {
                    productId: this.order._id, vendorId: this.order.vendorId, total: this.order.price, 
                    productName: this.order.name, clientName: this.user.username, payMethod: this.payMethod,
                    deliveryDate: this.delivery.date, deliveryTime: this.delivery.time, 
                    deliveryPhone: this.delivery.phone, address: this.delivery.address
                };
                axios.post('/api/checkout', d).then(function(r){ 
                    self.invoice = r.data; self.order = null; self.refresh(); 
                });
            },
            printInv: function(s) { this.invoice = s; },
            downloadInv: function() {
                html2canvas(document.querySelector("#facture")).then(canvas => {
                    var link = document.createElement('a'); link.download = 'Facture_MadaMarket.png';
                    link.href = canvas.toDataURL(); link.click();
                });
            },
            sendMsg: function() {
                if(this.msg) socket.emit('send_msg', {u: this.user.username, t: this.msg});
                this.msg = '';
            }
        },
        mounted: function() {
            var self = this;
            socket.on('receive_msg', function(d){ 
                self.messages.push(d);
                setTimeout(() => { var b = document.getElementById("chatbox"); if(b) b.scrollTop = b.scrollHeight; }, 100);
            });
        }
    });
</script>
</body>
</html>
    `);
});

server.listen(3001, function() { console.log("🚀 MADA MARKET V6 ULTIME SUR PORT 3001"); });
