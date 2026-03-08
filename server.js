// 1. Configuration Sécurité & Imports
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
var fs = require('fs');
var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');

var DB_FILE = 'database.json'; // Changé en .json pour éviter les bugs
var app = express();

// --- AJOUT : GÉNÉRATEUR D'ID UNIQUE ROBUSTE (NODE V6) ---
// Combine le préfixe, le temps exact et une chaîne mathématique aléatoire
function generateUniqueId(prefix) {
    var randomStr = Math.random().toString(36).substr(2, 9);
    return prefix + "_" + Date.now() + "_" + randomStr;
}

// --- 2. DÉFINITION DES FONCTIONS DE LECTURE (DOIVENT ÊTRE EN HAUT) ---
function read() { 
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); 
    } catch (e) {
        return { users: [], products: [], sales: [], supply: [], invoices: [], chat: [], employees: [], deliveries: [] };
    }
}

function save(d) { 
    fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2)); 
}

function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        var base = { users: [], products: [], sales: [], supply: [], invoices: [], chat: [], employees: [], deliveries: [] };
        fs.writeFileSync(DB_FILE, JSON.stringify(base, null, 2));
        console.log("✅ Fichier base de données créé.");
    }
}
initDB();

// --- 3. CONFIGURATION EXPRESS ---
app.use(bodyParser.json({ limit: '100mb' }));
app.use(express.static('public'));
app.use(express.static(__dirname));

// --- 4. INFOS SUPABASE ---
var SUPA_URL = 'https://lrwyonfaijpdpoyfhgtz.supabase.co/rest/v1/produits';
var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyd3lvbmZhaWpwZHBveWZoZ3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NTU5NzQsImV4cCI6MjA4ODEzMTk3NH0._1BjZUJPM2fpElJWnJlpnwB3A5dPW7tEXBHTFRi6GF8';

// --- 5. ROUTES API ---

// Connexion
app.post('/api/auth', function(req, res) {
    var db = read();
    var u = db.users.find(function(x) { return x.user === req.body.user && x.pass === req.body.pass; });
    if (u) {
        console.log("🔑 Connexion réussie : " + u.user);
        res.json({ success: true, user: u });
    } else {
        console.log("❌ Échec connexion : " + req.body.user);
        res.json({ success: false });
    }
});

// Inscription
app.post('/api/signup', function(req, res) {
    var db = read();
    if (db.users.find(function(u) { return u.user === req.body.user; })) {
        return res.json({ success: false });
    }
    // --- AJOUT : Utilisation du générateur d'ID unique ---
    var uniqueId = generateUniqueId("USER");
    var newUser = Object.assign({}, req.body, { id: uniqueId });
    db.users.push(newUser); 
    save(db);
    res.json({ success: true, user: newUser });
});

// Récupérer données
app.get('/api/data', function(req, res) { 
    res.json(read()); 
});

// Actions (Ventes, Stocks, Chat)
app.post('/api/action', function(req, res) {
    var db = read();
    var type = req.body.type;
    var data = req.body.data;
    var now = new Date().toLocaleString('fr-FR');
    
    if (type === 'sale') {
        var total = 0;
        data.cart.forEach(function(item) {
            var prod = db.products.find(function(x) { return x.id === item.id; });
            if (prod && prod.stock > 0) { 
                prod.stock--; 
                total += parseInt(prod.price); 
            }
        });
        // --- AJOUT : Utilisation du générateur d'ID unique ---
        var saleId = generateUniqueId("VENTE");
        var newSale = Object.assign({}, data, { id: saleId, amount: total, date: now });
        db.sales.push(newSale);
        
        db.invoices.push({ 
            id: generateUniqueId("FAC"), // --- AJOUT : ID Unique ---
            type: 'VENTE', 
            owner: data.owner, 
            client: data.client, 
            amount: total, 
            details: "Achat de " + data.cart.length + " produits", 
            date: now 
        });
    }

    if (type === 'add_prod') { 
        data.id = generateUniqueId("PROD"); // --- AJOUT : ID Unique ---
        db.products.push(data);
        
        // SYNCHRO SUPABASE
        var options = {
            url: SUPA_URL,
            headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ nom: data.name, prix: data.price, cree_le: new Date() }),
            strictSSL: false
        };
        request.post(options, function(err, resp) {
            console.log(err ? "❌ Erreur Cloud" : "🌍 Synchro Cloud OK");
        });
    }

    if (type === 'del_prod') { db.products = db.products.filter(function(p) { return p.id !== data.id; }); }
    
    if (type === 'chat') { 
        db.chat.push(Object.assign({}, data, { date: now })); 
    }

    if (type === 'add_emp') { 
        data.id = generateUniqueId("EMP"); // --- AJOUT : ID Unique ---
        data.jobs = 0; 
        db.employees.push(data); 
    }

    if (type === 'del_emp') { 
        db.employees = db.employees.filter(function(e) { return e.name !== data.name; }); 
    }

    if (type === 'supply') {
        var prod = db.products.find(function(x) { return x.id === data.pid; });
        if (prod) {
            prod.stock = parseInt(prod.stock) + parseInt(data.qty);
            db.invoices.push({ 
                type: 'ACHAT_STOCK', 
                owner: data.owner, 
                amount: data.total, 
                details: "Réappro de " + data.qty + "x " + prod.name, 
                date: now 
            });
        }
    }

    if (type === 'pay_salary') {
        db.invoices.push({ 
            type: 'SALAIRE', 
            owner: data.owner, 
            amount: data.amount, 
            details: "Paye de " + data.empName, 
            date: now 
        });
        var emp = db.employees.find(function(e) { return e.name === data.empName; });
        if (emp) emp.jobs = 0;
    }

    if (type === 'assign') {
        db.deliveries.push({
            id: generateUniqueId("LIV"), // --- AJOUT : ID Unique ---
            orderId: data.orderId,
            livreur: data.livreur,
            loc: data.loc,
            owner: data.owner,
            status: 'EN_COURS'
        });
        var emp = db.employees.find(function(e) { return e.name === data.livreur; });
        if (emp) { emp.jobs = (emp.jobs || 0) + 1; }
    }

    save(db);
    res.json({ success: true });
});

// --- 6. INTERFACE FRONT-END ---
app.get('/', function(req, res) {
    res.send(`<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>⚡ FLASHDEAL EMPIRE</title>
        <script src="https://cdn.jsdelivr.net/npm/vue@2.5.17/dist/vue.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
       
        <style>
    /* 1. CONFIGURATION DE BASE & RESET */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { 
        --p: #D4AF37; 
        --p-gradient: linear-gradient(45deg, #BF953F, #FCF6BA, #B38728, #FBF5B7, #AA771C);
        --bg: #0a0a0a; 
        --card: rgba(22, 22, 22, 0.9); 
        --mvola: #00a1e4; --orange: #ff6600; --airtel: #ed1c24; 
    }
    body { 
        background: url('/Background_client.jpg') no-repeat center center fixed; 
        background-size: cover; color: #fff; 
        font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
        overflow-x: hidden; min-height: 100vh;
    }

    /* 2. ANIMATION SPLASH SCREEN (MODIFIÉ POUR EFFET ÉBLOUISSANT) */
    .splash-screen { 
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: radial-gradient(circle, #1a1a1a 0%, #000000 100%); 
        display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 9999; 
        overflow: hidden;
    }
    
    /* --- AJOUT : NOUVEAUX EFFETS SPLASH SCREEN --- */
    /* --- MODIFICATION : AJOUT DE pointer-events: none --- */
    /* Lueur rotative en arrière-plan */
    .splash-screen::before {
        content: ''; 
        position: absolute; 
        top: -50%; 
        left: -50%; 
        width: 200%; 
        height: 200%;
        /* Ton dégradé Or */
        background: conic-gradient(transparent, rgba(212, 175, 55, 0.4), transparent 30%);
        /* On relance l'animation ici */
        animation: rotate-light 4s linear infinite; 
        /* Indispensable : laisse passer les clics vers les boutons */
        pointer-events: none; 
        z-index: 1;
    }

    /* L'instruction de rotation (ne pas oublier ce bloc !) */
    @keyframes rotate-light {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    /* On s'assure que le container du logo est au-dessus de la lumière */
    .splash-logo-container {
        position: relative; 
        z-index: 10;
        animation: pulse-glow 1.5s infinite alternate, zoom-in 1s ease-out;
    }
    .splash-logo-container img {
        max-width: 80vw; max-height: 80vh; object-fit: contain; border-radius: 20px;
        filter: drop-shadow(0 0 25px rgba(212, 175, 55, 0.9));
    }
    @keyframes pulse-glow {
        0% { filter: drop-shadow(0 0 10px rgba(212, 175, 55, 0.5)); transform: scale(0.98); }
        100% { filter: drop-shadow(0 0 50px rgba(212, 175, 55, 1)); transform: scale(1.03); }
    }
    @keyframes zoom-in { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    
    .flash-effect {
        position: absolute; width: 100%; height: 100%; top: 0; left: 0;
        background: rgba(255, 255, 255, 0.1); opacity: 0; z-index: 11; pointer-events: none;
        animation: lightning 4s infinite;
    }
    @keyframes lightning {
        0%, 95%, 98% { opacity: 0; }
        96%, 99% { opacity: 0.9; background: rgba(212, 175, 55, 0.3); }
        100% { opacity: 0; }
    }
    /* ------------------------------------------- */

    /* 3. STRUCTURE */
    .sidebar { width: 250px; background: rgba(0, 0, 0, 0.92); height: 100vh; position: fixed; left: 0; top: 0; border-right: 3px solid var(--p); padding: 20px; z-index: 100; overflow-y: auto; backdrop-filter: blur(10px); }
    .main { margin-left: 250px; padding: 25px; width: calc(100% - 250px); min-height: 100vh; }

    /* 4. COMPOSANTS */
    .card { background: var(--card); border: 1px solid rgba(212, 175, 55, 0.25); padding: 15px; border-radius: 12px; margin-bottom: 20px; backdrop-filter: blur(8px); box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
    .input { width: 100%; padding: 12px; margin: 8px 0; background: rgba(0, 0, 0, 0.7); color: #fff; border: 1px solid rgba(212, 175, 55, 0.4); border-radius: 6px; outline: none; }
    .input:focus { border-color: var(--p); box-shadow: 0 0 8px rgba(212, 175, 55, 0.3); }

    /* 5. BOUTONS */
    .btn { padding: 12px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; margin-bottom: 10px; text-transform: uppercase; transition: all 0.3s ease; font-size: 0.85rem; }
    .btn-p { background: var(--p-gradient); color: #000; box-shadow: 0 2px 10px rgba(212, 175, 55, 0.3); }
    .btn-p:hover { filter: brightness(1.2); transform: translateY(-2px); box-shadow: 0 5px 15px rgba(212, 175, 55, 0.5); }
    .btn-m { background: var(--mvola); color: white; } .btn-o { background: var(--orange); color: white; } .btn-a { background: var(--airtel); color: white; }

    /* 6. GRILLE & BOUTONS ROLE */
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
    .img-prod { width: 100%; height: 150px; object-fit: cover; border-radius: 8px; margin-bottom: 10px; border: 1px solid #333; }
    .big-btn { background: rgba(17, 17, 17, 0.9); border: 2px solid var(--p); padding: 40px; text-align: center; cursor: pointer; width: 280px; margin: 15px; border-radius: 15px; transition: 0.4s; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
    .big-btn:hover { background: var(--p); color: #000; transform: translateY(-10px); }
    .big-btn h2 { font-size: 1.8rem; margin-bottom: 10px; } .big-btn p { color: var(--p); font-weight: bold; } .big-btn:hover p { color: #000; }

    @media (max-width: 900px) {
        .sidebar { width: 70px; padding: 10px; overflow: hidden; }
        .sidebar h2, .sidebar p, .sidebar span { display: none; }
        .main { margin-left: 70px; width: calc(100% - 70px); }
        .big-btn { width: 90%; }
    }
        </style>
    </head>
    <body>
        <div id="app">
            
            <div v-if="view === 'splash'" class="splash-screen">
                <div class="flash-effect"></div>
                <div class="splash-logo-container">
                    <img src="/image acceuil animation.jpg">
                </div>
                <div style="margin-top: 40px; color: var(--p); font-family: 'Courier New', monospace; font-weight: bold; font-size: 1.2rem; z-index: 10; text-shadow: 0 0 15px var(--p); letter-spacing: 3px;">
                    INITIALISATION DU SYSTEME...
                </div>
            </div>
    
            <div v-if="view === 'role'" class="splash-screen">
                <h2 style="color:white; margin-bottom: 30px; text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">
                    <img src="/logo.jpg" style="height: 50px; vertical-align: middle; margin-right: 15px; border-radius: 50%; box-shadow: 0 0 10px var(--p);"> SÉLECTIONNEZ VOTRE ESPACE
                </h2>
                <div style="display:flex; flex-wrap:wrap; justify-content:center;">
                    <div class="big-btn" @click="selectRole('admin')"><h2>👨‍💼 PATRON</h2><p>Gestion, Stocks & Salaires</p></div>
                    <div class="big-btn" @click="selectRole('client')"><h2>🛒 CLIENT</h2><p>Acheter sur le Market</p></div>
                </div>
            </div>
    
            <div v-if="view === 'auth'" style="height:100vh; display:flex; justify-content:center; align-items:center;">
                <div class="card" style="width:380px; text-align:center; box-shadow: 0 0 20px rgba(255,69,0,0.5);">
                    <h1 style="color:var(--p); letter-spacing: 2px;">ESPACE {{ form.role === 'admin' ? 'PATRON' : 'CLIENT' }}</h1>
                    <div v-if="!isLogin && form.role === 'admin'"><input v-model="form.shop" class="input" placeholder="Nom de l'Entreprise"></div>
                    <input v-model="form.user" class="input" placeholder="Identifiant">
                    <input v-model="form.pass" type="password" class="input" placeholder="Mot de passe">
                    <button class="btn btn-p" @click="authAction">{{ isLogin ? 'SE CONNECTER' : 'CRÉER MON COMPTE' }}</button>
                    <p @click="isLogin=!isLogin" style="cursor:pointer; font-size:0.8rem; color: #ccc;">{{ isLogin ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter" }}</p>
                    <button class="btn" style="background:#333; margin-top:15px;" @click="view='role'">⬅️ RETOUR AU CHOIX</button>
                </div>
            </div>
    
            <div v-if="view === 'dashboard' && session && session.role === 'admin'">
                <div class="sidebar">
                    <h2 style="color:var(--p); margin-bottom: 5px;">
                        <img src="logo.jpg" style="height: 30px; border-radius: 50%; vertical-align: middle; margin-right: 10px;">
                        {{session.shop}}
                    </h2>
                    <p style="font-size: 0.7rem; color: gray; margin-bottom: 20px;">ADMIN: {{session.user}}</p>
                    <button class="btn btn-p" @click="load">🔄 RAFRAÎCHIR</button>
                    <button class="btn btn-p" @click="tab='compta'">💰 COMPTABILITÉ</button>
                    <button class="btn btn-p" @click="tab='inv'">📦 STOCKS & PHOTOS</button>
                    <button class="btn btn-p" @click="tab='liv'">🛵 LIVREURS & SALAIRES</button>
                    <button class="btn btn-p" @click="tab='gps'">🛰️ SUIVI LIVRAISONS</button> <button class="btn btn-p" @click="tab='chat'">💬 TCHAT + FICHIERS</button>
                    <button class="btn" style="background:red; margin-top:30px;" @click="logout">🚪 DÉCONNEXION</button>
                </div>
    
                <div class="main">
                    <div v-if="tab==='compta'">
                        <div class="grid">
                            <div class="card" style="border-left: 5px solid #0f0;"><h4>GAINS TOTAL</h4><h2 style="color:#0f0;">{{calc.ca}} AR</h2></div>
                            <div class="card" style="border-left: 5px solid #f00;"><h4>PERTES TOTAL</h4><h2 style="color:#f00;">{{calc.dep}} AR</h2></div>
                            <div class="card" style="border: 2px solid var(--p);"><h4>BÉNÉFICE NET</h4><h2>{{calc.net}} AR</h2></div>
                        </div>
                        <h3>HISTORIQUE DES 3 FACTURES</h3>
                        <div v-for="i in myInvoices" class="card">
                            <span class="badge" :style="{background: i.type==='VENTE'?'green':'red'}">{{i.type}}</span>
                            <b>{{i.date}}</b><br>
                            Montant: <b>{{i.amount}} AR</b> | <small>{{i.details}}</small>
                        </div>
                    </div>
    
                    <div v-if="tab==='inv'">
                        <div class="card">
                            <h3>AJOUTER UN PRODUIT</h3>
                            <input v-model="newP.name" class="input" placeholder="Nom du produit">
                            
                            <select v-model="newP.category" class="input">
                                <option value="">-- Choisir Catégorie --</option>
                                <option value="Électronique">Électronique</option>
                                <option value="Mode">Mode</option>
                                <option value="Alimentation">Alimentation</option>
                                <option value="Services">Services</option>
                                <option value="Autre">Autre</option>
                            </select>

                            <input v-model="newP.price" type="number" class="input" placeholder="Prix de vente">
                            <input v-model="newP.stock" type="number" class="input" placeholder="Stock initial">
                            <label style="font-size:0.8rem;">IMAGE PRODUIT :</label>
                            <input type="file" @change="handleFile($event, 'prod')" class="input">
                            <button class="btn btn-p" @click="doAction('add_prod', Object.assign({}, newP, {owner:session.user, shopName:session.shop}))">METTRE EN VENTE</button>
                        </div>
                        <h3>MON INVENTAIRE</h3>
                        
                        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                            <input v-model="adminSearchQuery" class="input" placeholder="🔍 Rechercher dans mon inventaire..." style="flex: 2;">
                            <select v-model="adminSearchCategory" class="input" style="flex: 1;">
                                <option value="">Toutes les catégories</option>
                                <option value="Électronique">Électronique</option>
                                <option value="Mode">Mode</option>
                                <option value="Alimentation">Alimentation</option>
                                <option value="Services">Services</option>
                                <option value="Autre">Autre</option>
                            </select>
                        </div>
                        
                        <div class="grid">
                            <div v-for="p in filteredAdminProducts" class="card">
                                <img v-if="p.file" :src="p.file" class="img-prod">
                                <h4>{{p.name}}</h4>
                                <p style="font-size: 0.8rem; color: var(--p);">{{p.category || 'Non classé'}}</p> <p>STOCK: <b>{{p.stock}}</b> | {{p.price}} AR</p>
                                <div style="background:rgba(0,0,0,0.5); padding:10px; border-radius:8px; margin-bottom: 10px;">
                                    <small>ACHAT STOCK FOURNISSEUR</small>
                                    <input type="number" v-model="p.q" class="input" placeholder="Qté">
                                    <input type="number" v-model="p.c" class="input" placeholder="Coût Total">
                                    <button class="btn btn-p" style="font-size:0.7rem; padding:5px;" @click="buyStock(p)">VALIDER ACHAT</button>
                                </div>
                                <button class="btn" style="background:red;" @click="doAction('del_prod', p)">🗑️ SUPPRIMER</button>
                            </div>
                        </div>
                    </div>
    
                    <div v-if="tab==='liv'">
                        <div class="card">
                            <h3>RECRUTER UN LIVREUR (N1, N2...)</h3>
                            <input v-model="newEmp.name" class="input" placeholder="Nom du livreur">
                            <button class="btn btn-p" @click="doAction('add_emp', Object.assign({}, newEmp, {owner:session.user}))">RECRUTER</button>
                        </div>
                        <h3>COMMANDES À ASSIGNER</h3>
                        <div v-for="s in mySales" class="card" v-if="!isAssigned(s.id)">
                            <span class="badge" style="background:var(--p)">VENTE #{{s.id.slice(-4)}}</span>
                            <b>LIEU: {{s.loc}}</b><br>
                            Assigner à : 
                            <select :id="'sel_'+s.id" class="input" style="width:150px; display:inline-block;">
                                <option v-for="e in myEmployees" :value="e.name">{{e.name}}</option>
                            </select>
                            <button class="btn btn-p" style="width:auto; margin-left:10px;" @click="assignTask(s)">VALIDER MISSION</button>
                        </div>
                        <hr style="border-color:#333;">
                        <h3>PAYER LES SALAIRES</h3>
                        <div class="grid">
                            <div v-for="e in myEmployees" class="card">
                                <b>{{e.name}}</b><br>
                                Missions faites: {{e.jobs}}<br>
                                <input type="number" v-model="e.pay" class="input" placeholder="Montant AR">
                                <button class="btn btn-o" @click="paySal(e)">PAYER SALAIRE</button>
                                <button @click="doAction('del_emp', e)" style="color:red; background:none; border:none; cursor:pointer;">Virer</button>
                            </div>
                        </div>
                    </div>
    
                    <div v-if="tab==='gps'">
                        <div class="card">
                            <h3>🛵 LISTE DES LIVRAISONS</h3>
                            <p style="color:#ccc; font-size:0.9rem;">Apparaît automatiquement après la commande client.</p>
                            <div class="grid" style="margin-top: 15px;">
                                <div v-for="s in mySales" class="card" style="border-left: 5px solid var(--p);">
                                    <h4 style="color:var(--p)">COMMANDE #{{s.id.slice(-4)}}</h4>
                                    <p><b>📍 Lieu :</b> {{s.loc}}</p>
                                    <p><b>👤 Livreur :</b> 
                                        <span v-if="isAssigned(s.id)" style="color:#0f0; font-weight:bold;">{{ getLivreur(s.id) }}</span>
                                        <span v-else style="color:#f00; font-weight:bold;">Non assigné</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
    
                    <div v-if="tab==='chat'">
                        <div class="card" style="height:350px; overflow-y:auto; background:rgba(0,0,0,0.5);">
                            <div v-for="m in myChat" :style="{textAlign: m.role==='admin'?'right':'left'}">
                                <div :style="{background:m.role==='admin'?'#333':'var(--p)', padding:'10px', borderRadius:'10px', display:'inline-block', margin:'5px', maxWidth:'80%'}">
                                    <b>{{m.sender}}:</b> {{m.text}}
                                    <img v-if="m.file" :src="m.file" style="max-width:100%; display:block; margin-top:5px; border-radius:5px;">
                                </div>
                            </div>
                        </div>
                        <div class="card">
                            <input v-model="newMsg" class="input" placeholder="Répondre..." @keyup.enter="sendChat">
                            <input type="file" @change="handleFile($event, 'chat')" class="input" id="chatFile">
                            <button class="btn btn-p" @click="sendChat">ENVOYER</button>
                        </div>
                    </div>
                </div>
            </div>
    
            <div v-if="view === 'dashboard' && session && session.role === 'client'">
                
                <div style="background:rgba(0,0,0,0.85); padding:15px; display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid var(--p); position:sticky; top:0; z-index:100; backdrop-filter: blur(10px);">
                    <h2 style="color:var(--p); margin:0;">
                        <img src="logo.jpg" style="height: 35px; border-radius: 50%; vertical-align: middle; margin-right: 10px;">
                        ⚡ MARKET
                    </h2>
                    <div style="display:flex; gap: 10px;">
                        <button class="btn btn-p" style="width:auto; margin:0;" @click="tab='boutique'; load()">🛍️ BOUTIQUE</button>
                        <button class="btn btn-p" style="width:auto; margin:0;" @click="tab='my_inv'">🧾 MES FACTURES</button>
                        <button class="btn btn-p" style="width:auto; margin:0;" @click="tab='my_chat'">💬 SAV / CHAT</button>
                        <button class="btn btn-o" style="width:auto; margin:0;" @click="showHelp">❓ AIDE</button>
                        <button class="btn btn-p" style="width:auto; margin:0;" @click="showCart=true">🛒 PANIER ({{cart.length}})</button>
                        <button class="btn" style="background:red; width:auto; margin:0;" @click="logout">🚪 DÉCONNEXION</button>
                    </div>
                </div>

                <div v-if="tab==='boutique'">
                    <div style="padding: 20px 25px 0 25px; display: flex; gap: 10px; flex-wrap: wrap;">
                        <input v-model="searchQuery" class="input" placeholder="🔍 Rechercher un produit, un magasin..." style="flex: 2; margin: 0;">
                        <select v-model="searchCategory" class="input" style="flex: 1; margin: 0;">
                            <option value="">Toutes les catégories</option>
                            <option value="Électronique">Électronique</option>
                            <option value="Mode">Mode</option>
                            <option value="Alimentation">Alimentation</option>
                            <option value="Services">Services</option>
                            <option value="Autre">Autre</option>
                        </select>
                    </div>

                    <div class="grid" style="padding:25px;">
                        <div v-for="p in filteredProducts" class="card" style="text-align:center;">
                            <img v-if="p.file" :src="p.file" class="img-prod">
                            <h3>{{p.name}}</h3>
                            <p style="color:#ccc; font-size:0.8rem;">Boutique: {{p.shopName}}</p>
                            <p style="font-size: 0.8rem; color: var(--p);">{{p.category || 'Non classé'}}</p> <h2 style="color:var(--p)">{{p.price}} AR</h2>
                            <button class="btn btn-p" :disabled="p.stock<=0" @click="cart.push(p)">{{ p.stock>0 ? 'ACHETER' : 'RUPTURE' }}</button>
                        </div>
                    </div>
                </div>

                <div v-if="tab==='my_inv'" style="padding:20px;">
                    <h2 style="color:var(--p)">📑 MES FACTURES D'ACHATS</h2>
                    <div v-for="i in invoices.filter(inv => inv.client === session.user)" class="card" style="border-left: 5px solid var(--p);">
                        <div style="display:flex; justify-content:space-between;">
                            <span><b>Numéro:</b> {{i.id}}</span>
                            <span class="badge" style="background:green;">PAYÉ</span>
                        </div>
                        <hr style="margin:10px 0; border-color:#333;">
                        <p>Date: {{i.date}}</p>
                        <p>Montant: <b style="color:var(--p)">{{i.amount}} AR</b></p>
                        <button class="btn btn-p" style="width:auto; font-size:0.8rem; margin-top:10px;" @click="downloadPNG(i)">📸 TÉLÉCHARGER PNG</button>
                    </div>

                    <div id="invoice-capture" style="position: absolute; left: -9999px; width: 400px; padding: 30px; background: #ffffff; color: #000000; font-family: sans-serif;">
                        <div style="text-align: center; border-bottom: 3px solid #D4AF37; padding-bottom: 15px;">
                            <h1 style="margin: 0; color: #000;">
                                <img src="logo.jpg" style="height: 40px; vertical-align: middle; margin-right: 10px;">
                                ⚡ FLASHDEAL
                            </h1>
                            <p style="font-size: 14px; margin: 0; color: #555;">Reçu de paiement électronique</p>
                        </div>
                        <div style="margin-top: 20px; font-size: 16px;">
                            <p><b>Numéro :</b> {{selectedInv.id}}</p>
                            <p><b>Date :</b> {{selectedInv.date}}</p>
                            <p><b>Client :</b> {{selectedInv.client}}</p>
                            <p><b>Boutique :</b> {{selectedInv.owner}}</p>
                        </div>
                        <div style="margin-top: 30px; background: #f0f0f0; padding: 15px; border-radius: 8px;">
                            <p style="margin: 0;"><b>Détails :</b> {{selectedInv.details}}</p>
                        </div>
                        <div style="margin-top: 30px; text-align: center;">
                            <h2 style="margin: 0; font-size: 28px; color: #000;">TOTAL : {{selectedInv.amount}} AR</h2>
                            <div style="margin-top: 20px; border: 4px solid #0f0; color: #0f0; display: inline-block; padding: 10px 20px; transform: rotate(-10deg); font-weight: bold; font-size: 24px; border-radius: 8px;">PAYÉ</div>
                        </div>
                        <p style="text-align: center; font-size: 12px; margin-top: 40px; color: #888;">Document généré automatiquement.</p>
                    </div>
                </div>
        
                <div v-if="tab==='my_chat'" style="padding:20px;">
                    <h2 style="color:var(--p)">💬 DISCUTER AVEC LA BOUTIQUE</h2>
                    <div class="card" style="height:300px; overflow-y:auto; background:rgba(0,0,0,0.5);">
                        <div v-for="m in chat.filter(c => c.owner === session.user || c.sender === session.user || c.dest === session.user)" 
                            :style="{textAlign: m.sender === session.user ? 'right' : 'left'}">
                            <div :style="{background: m.sender === session.user ? '#333' : 'var(--p)', padding:'10px', borderRadius:'10px', display:'inline-block', margin:'5px', maxWidth:'80%'}">
                                <small style="font-size:0.6rem; display:block; color: #ccc;">{{m.sender}}</small>
                                {{m.text}}
                                <img v-if="m.file" :src="m.file" style="max-width:100%; display:block; margin-top:5px; border-radius: 5px;">
                            </div>
                        </div>
                    </div>
                    <div class="card">
                        <input v-model="newMsg" class="input" placeholder="Votre message..." @keyup.enter="sendChatClient">
                        <input type="file" @change="handleFile($event, 'chat')" class="input" id="chatFileClient">
                        <button class="btn btn-p" @click="sendChatClient">ENVOYER AU SAV</button>
                    </div>
                </div>
    
                <div v-if="showCart" style="position:fixed; right:0; top:0; width:360px; height:100vh; background:rgba(0,0,0,0.95); border-left:3px solid var(--p); padding:30px; z-index:200; box-shadow: -10px 0 30px rgba(0,0,0,0.8); backdrop-filter: blur(10px);">
                    <h2 style="color:var(--p)">MA COMMANDE</h2>
                    <div v-for="(c,i) in cart" class="card" style="margin-bottom:5px;">{{c.name}} | {{c.price}} AR <button @click="cart.splice(i,1)" style="color:red; float:right; background:none; border:none; cursor:pointer;">X</button></div>
                    <h3 style="border-top:1px solid #333; padding-top:10px;">TOTAL: {{cTotal}} AR</h3>
                    <input v-model="loc" class="input" placeholder="Lieu de livraison (ex: Itaosy)">
                    <p style="font-size:0.8rem;">CHOISIR PAIEMENT :</p>
                    <button class="btn btn-m" @click="checkout('MVOLA')">MVOLA</button>
                    <button class="btn btn-o" @click="checkout('ORANGE')">ORANGE</button>
                    <button class="btn btn-a" @click="checkout('AIRTEL')">AIRTEL</button>
                    <button class="btn" style="background:#444; margin-top:20px;" @click="showCart=false">FERMER LE PANIER</button>
                </div>
            </div>
            
        </div>

        <script>
            new Vue({
                el: '#app',
                data: {
                    view: 'splash', 
                    session: null, 
                    isLogin: true, 
                    tab: 'compta', 
                    form: {user:'', pass:'', role:'', shop:''},
                    products:[], sales:[], supply:[], chat:[], employees:[], deliveries:[], invoices:[],
                    newP:{name:'',price:0,stock:0,file:'', category:''}, 
                    newEmp:{name:''},
                    cart:[], showCart:false, loc:'', newMsg:'', chatFile:'', map:null, refreshInterval: null,
                    selectedInv: { id:'', date:'', client:'', amount:0, details:'', owner:'' },
                    searchQuery: '', 
                    searchCategory: '',
                    // --- AJOUT : Variables pour la recherche Admin ---
                    adminSearchQuery: '',
                    adminSearchCategory: ''
                },
                mounted: function() {
                    var self = this;
                    // L'animation dure 3.5 secondes pour profiter de l'effet
                    setTimeout(function() { self.view = 'role'; }, 3500);
                },
                computed: {
                    myProducts: function() { var s=this; return this.products.filter(function(p){ return p.owner === s.session.user; }); },
                    myEmployees: function() { var s=this; return this.employees.filter(function(e){ return e.owner === s.session.user; }); },
                    mySales: function() { var s=this; return this.sales.filter(function(v){ return v.owner === s.session.user; }); },
                    myInvoices: function() { var s=this; return this.invoices.filter(function(i){ return i.owner === s.session.user; }); },
                    myChat: function() { var s=this; return this.chat.filter(function(c){ return c.owner === s.session.user || c.sender === s.session.user; }); },
                    cTotal: function() { return this.cart.reduce(function(a,b){ return a+parseInt(b.price); }, 0); },
                    calc: function() {
                        var ca=0, dep=0;
                        this.myInvoices.forEach(function(i){ if(i.type==='VENTE') ca+=parseInt(i.amount); else dep+=parseInt(i.amount); });
                        return { ca:ca, dep:dep, net:ca-dep };
                    },
                    filteredProducts: function() {
                        var s = this.searchQuery.toLowerCase();
                        var c = this.searchCategory;
                        return this.products.filter(function(p) {
                            var matchName = p.name.toLowerCase().indexOf(s) !== -1 || (p.shopName && p.shopName.toLowerCase().indexOf(s) !== -1);
                            var matchCat = c === '' || p.category === c;
                            return matchName && matchCat;
                        });
                    },
                    // --- AJOUT : Filtrage pour l'inventaire Admin ---
                    filteredAdminProducts: function() {
                        var s = this.adminSearchQuery.toLowerCase();
                        var c = this.adminSearchCategory;
                        return this.myProducts.filter(function(p) {
                            var matchName = p.name.toLowerCase().indexOf(s) !== -1;
                            var matchCat = c === '' || p.category === c;
                            return matchName && matchCat;
                        });
                    }
                },
                methods: {
                    selectRole: function(role) {
                        this.form.role = role;
                        this.view = 'auth';
                        this.isLogin = true;
                    },
                    logout: function() {
                        this.session = null;
                        this.view = 'role';
                        if (this.refreshInterval) clearInterval(this.refreshInterval);
                    },
                    showHelp: function() {
                        alert("📞 BESOIN D'AIDE ?\\n\\n1. Ajoutez des produits au panier.\\n2. Entrez votre adresse de livraison.\\n3. Payez par MVola, Orange ou Airtel.\\n\\nService Client : 034 00 000 00");
                    },
                    authAction: function() {
                        var self=this;
                        fetch(this.isLogin ? '/api/auth' : '/api/signup', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(this.form) })
                        .then(function(r){ return r.json(); }).then(function(res){
                            if(res.success){ 
                                self.session = res.user; 
                                self.view = 'dashboard';
                                self.tab = res.user.role === 'admin' ? 'compta' : 'boutique';
                                self.load(); 
                                self.refreshInterval = setInterval(self.load.bind(self), 5000); 
                            } else {
                                alert("Erreur : Identifiant ou mot de passe incorrect.");
                            }
                        });
                    },
                    load: function() { var self=this; fetch('/api/data').then(function(r){ return r.json(); }).then(function(d){ Object.assign(self, d); }); },
                    doAction: function(t, d) { var self=this; fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:t, data:d})}).then(function(){self.load();}); },
                    
                    handleFile: function(e, type) {
                        var self=this; var reader = new FileReader();
                        reader.onload = function(ev) { if(type==='prod') self.newP.file=ev.target.result; else self.chatFile=ev.target.result; };
                        reader.readAsDataURL(e.target.files[0]);
                    },
                    buyStock: function(p) { this.doAction('supply', { pid:p.id, qty:p.q, total:p.c, owner:this.session.user }); p.q=0; p.c=0; },
                    paySal: function(e) { this.doAction('pay_salary', { empName:e.name, amount:e.pay, owner:this.session.user }); e.pay=0; },
                    
                    checkout: function(m) { 
                        if(!this.loc || this.cart.length===0) return alert("Lieu ou Panier vide !");
                        this.doAction('sale', { client:this.session.user, loc:this.loc, cart:this.cart, method:m, owner:this.cart[0].owner });
                        this.cart=[]; this.showCart=false;
                        alert("✅ Commande envoyée avec succès !");
                        this.tab = 'my_inv'; 
                    },

                    getLivreur: function(id) {
                        var d = this.deliveries.find(function(x){ return x.orderId === id; });
                        return d ? d.livreur : '';
                    },
                    assignTask: function(s) { 
                        var l=document.getElementById('sel_'+s.id).value;
                        this.doAction('assign',{orderId:s.id, livreur:l, loc:s.loc, owner:this.session.user});
                    },
                    isAssigned: function(id) { return this.deliveries.some(function(d){ return d.orderId===id; }); },

                    downloadPNG: function(inv) {
                        var self = this;
                        this.selectedInv = inv; 
                        setTimeout(function() {
                            var target = document.querySelector("#invoice-capture");
                            if(!target) return alert("Erreur avec le modèle de facture.");
                            html2canvas(target).then(function(canvas) {
                                var link = document.createElement('a');
                                link.download = 'Facture_FlashDeal_' + inv.date.split(' ')[0] + '.png';
                                link.href = canvas.toDataURL("image/png");
                                link.click();
                            });
                        }, 500);
                    },

                    sendChat: function() { 
                        this.doAction('chat', { sender:this.session.user, role:this.session.role, text:this.newMsg, file:this.chatFile, owner:this.session.user }); 
                        this.newMsg=''; this.chatFile=''; 
                        var f = document.getElementById('chatFile'); if(f) f.value='';
                    },

                    sendChatClient: function() {
                        if(!this.newMsg && !this.chatFile) return;
                        this.doAction('chat', { 
                            sender: this.session.user, 
                            role: 'client', 
                            text: this.newMsg, 
                            file: this.chatFile,
                            owner: 'admin' 
                        });
                        this.newMsg = ''; this.chatFile = '';
                        var f = document.getElementById('chatFileClient'); if(f) f.value='';
                    }
                }
            });
        </script>
    </body>
    </html>
    `);
});
    
// --- 7. DÉMARRAGE DU SERVEUR ---
var PORT = 3000;
app.listen(PORT, function() {
    console.log("------------------------------------------");
    console.log("🚀 EMPIRE DASHBOARD READY");
    console.log("🏠 URL: http://localhost:" + PORT);
    console.log("📂 DB: " + DB_FILE);
    console.log("------------------------------------------");
});
