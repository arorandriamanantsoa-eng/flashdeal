const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(bodyParser.json());

// --- CONFIGURATION DU DISQUE POUR RENDER ---
// On utilise /data si le disque est présent, sinon le dossier local
const DB_DIR = '/data';
const DB_FILE = path.join(DB_DIR, 'database.json');

// Création automatique du dossier et du fichier si absent
if (!fs.existsSync(DB_DIR)) {
    // Si on n'est pas sur Render avec un disque, on utilise le dossier local
    var localFile = './database.json';
    if (!fs.existsSync(localFile)) {
        fs.writeFileSync(localFile, JSON.stringify({p:[], v:[], m:[]}));
    }
    var current_db = localFile;
} else {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({p:[], v:[], m:[]}));
    }
    var current_db = DB_FILE;
}

// --- API DE SYNCHRONISATION ---
app.get('/api/sync', function(req, res) {
    res.setHeader('Cache-Control', 'no-cache');
    var data = fs.readFileSync(current_db, 'utf8');
    res.send(data);
});

app.post('/api/action', function(req, res) {
    var db = JSON.parse(fs.readFileSync(current_db, 'utf8'));
    if(req.body.type === 'add') db.p.push(req.body.data);
    if(req.body.type === 'buy') db.v.push(req.body.data);
    if(req.body.type === 'msg') db.m.push(req.body.data);
    fs.writeFileSync(current_db, JSON.stringify(db, null, 2));
    res.json({ s: true });
});

// --- PAGE ADMIN SECRÈTE (/admin) ---
app.get('/admin', function(req, res) {
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ADMIN - flashdeal</title>';
    html += '<style>body{background:#080808;color:#e0e0e0;font-family:"Segoe UI",sans-serif;margin:0;padding:40px;} h1{color:#d4af37;text-shadow:0 0 10px rgba(212,175,55,0.3);} .box{background:rgba(255,255,255,0.03);padding:20px;border-radius:15px;border:1px solid rgba(212,175,55,0.2);margin-bottom:25px;backdrop-filter:blur(10px);} input{width:100%;padding:12px;margin:8px 0;background:#000;color:white;border:1px solid #333;border-radius:8px;transition:0.3s;} input:focus{border-color:#d4af37;outline:none;box-shadow:0 0 8px rgba(212,175,55,0.2);} .btn{background:linear-gradient(135deg,#d4af37,#b8952e);color:black;padding:12px;width:100%;border:none;font-weight:bold;border-radius:8px;cursor:pointer;text-transform:uppercase;transition:0.3s;} .btn:hover{transform:translateY(-2px);box-shadow:0 5px 15px rgba(212,175,55,0.4);} .chat{height:180px;overflow-y:auto;background:#050505;padding:15px;border-radius:10px;border:1px solid #222;margin-bottom:10px;font-size:13px;}</style></head><body>';
    html += '<h1>🔱 PANNEAU DE CONTRÔLE - FLASH DEAL</h1>';
    html += '<div class="box"><h3>📦 AJOUTER UN PRODUIT</h3><input id="n" placeholder="Nom du produit"><input id="p" type="number" placeholder="Prix (MGA)"><input id="i" placeholder="URL Image (Optionnel)"><button class="btn" onclick="addP()">Mettre en ligne</button></div>';
    html += '<div class="box" style="background:rgba(212,175,55,0.1);border:1px solid #d4af37;color:#d4af37;text-align:center;"><b>CHIFFRE D\'AFFAIRES TOTAL: <span id="ca" style="font-size:24px;">0</span> MGA</b></div>';
    html += '<div class="box"><h3>📊 VENTES RÉCENTES</h3><div id="v-list"></div></div>';
    html += '<div class="box"><h3>💬 CENTRE DE MESSAGERIE</h3><div id="chat-admin" class="chat"></div><input id="m-admin" placeholder="Écrire une réponse..." onkeypress="if(event.key===\'Enter\')sendM()"></div>';
    html += '<script>';
    html += 'function sync(){ fetch("/api/sync?t="+Date.now()).then(r=>r.json()).then(db=>{';
    html += 'var tot=0; var vh=""; db.v.forEach(v=>{ tot+=parseInt(v.p||0); vh+="<div style=\'border-bottom:1px solid #222;padding:10px;display:flex;justify-content:space-between;align-items:center;\'><span><b>"+v.n+"</b> - "+v.p+" MGA</span> <button class=\'btn\' style=\'width:auto;padding:5px 15px;font-size:11px;\' onclick=\'fact(\\""+v.n+"\\","+v.p+",\\""+v.a+"\\")\'>FACTURE</button></div>"; });';
    html += 'document.getElementById("ca").innerText=tot.toLocaleString(); document.getElementById("v-list").innerHTML=vh;';
    html += 'var mh=""; db.m.forEach(m=>{ mh+="<div style=\'margin-bottom:8px;\'><b style=\'color:#d4af37\'>"+m.u+":</b> "+m.t+"</div>"; }); document.getElementById("chat-admin").innerHTML=mh; document.getElementById("chat-admin").scrollTop=9999;';
    html += '});}';
    html += 'function addP(){ var n=document.getElementById("n").value,p=document.getElementById("p").value,i=document.getElementById("i").value; if(!n||!p)return; fetch("/api/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"add",data:{n:n,p:p,i:i}})}).then(()=>{document.getElementById("n").value="";document.getElementById("p").value="";sync();}); }';
    html += 'function sendM(){ var m=document.getElementById("m-admin").value; if(!m)return; fetch("/api/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"msg",data:{u:"ADMIN",t:m}})}).then(()=>{document.getElementById("m-admin").value="";sync();}); }';
    html += 'function fact(n,p,a){ var w=window.open("",""); w.document.write("<html><body style=\'padding:40px;font-family:sans-serif;background:#f9f9f9;\'><div style=\'background:white;padding:30px;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.1);border-top:10px solid #d4af37;\'><h1>FLASH DEAL</h1><hr><h2>FACTURE CLIENT</h2><p><b>PRODUIT:</b> "+n+"</p><p><b>PRIX:</b> "+p+" MGA</p><p><b>LIVRAISON:</b> "+a+"</p><p><b>DATE:</b> "+new Date().toLocaleString()+"</p><hr><button onclick=\'window.print()\' style=\'padding:10px 20px;background:#d4af37;border:none;color:white;cursor:pointer;font-weight:bold;border-radius:5px;\'>IMPRIMER LA FACTURE</button></div></body></html>"); }';
    html += 'setInterval(sync,3000); sync(); </script></body></html>';
    res.send(html);
});

// --- PAGE BOUTIQUE CLIENT (/) ---
app.get('/', function(req, res) {
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>FLASH DEAL - LUXE</title>';
    html += '<style>body{background:#050505;color:white;font-family:"Poppins",sans-serif;margin:0;padding:40px;background-image:radial-gradient(circle at top right, #1a1a1a, #050505);} .grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:30px;padding-top:20px;} .card{background:rgba(255,255,255,0.03);padding:0;border-radius:20px;text-align:center;border:1px solid rgba(255,255,255,0.08);overflow:hidden;transition:0.4s;backdrop-filter:blur(10px);} .card:hover{transform:translateY(-10px);border-color:#d4af37;box-shadow:0 10px 30px rgba(212,175,55,0.15);} img{width:100%;height:200px;object-fit:cover;transition:0.5s;} .card:hover img{scale:1.1;} .card-info{padding:20px;} .btn{background:#d4af37;color:black;padding:12px;width:100%;border:none;font-weight:bold;cursor:pointer;border-radius:12px;transition:0.3s;text-transform:uppercase;letter-spacing:1px;} .btn:hover{background:#fff;box-shadow:0 5px 15px rgba(255,255,255,0.2);} .search{width:100%;padding:18px;margin-bottom:30px;background:rgba(255,255,255,0.05);border:1px solid rgba(212,175,55,0.3);color:white;font-size:18px;border-radius:15px;box-sizing:border-box;transition:0.3s;} .search:focus{outline:none;border-color:#d4af37;background:rgba(255,255,255,0.08);} .chat-client{position:fixed;bottom:25px;right:25px;width:320px;background:#111;border:1px solid #d4af37;padding:20px;border-radius:20px;box-shadow:0 15px 40px rgba(0,0,0,0.6);backdrop-filter:blur(10px);} #cc{height:120px;overflow-y:auto;font-size:13px;margin-bottom:15px;padding-right:5px;border-bottom:1px solid #222;} .chat-input-group{display:flex;gap:5px;} .chat-input-group input{background:#000;border:1px solid #333;color:white;padding:8px;border-radius:8px;} ::-webkit-scrollbar{width:6px;} ::-webkit-scrollbar-thumb{background:#d4af37;border-radius:10px;}</style></head><body>';
    html += '<h1 id="title" style="color:#d4af37;font-size:42px;margin-bottom:10px;letter-spacing:2px;text-align:center;">BIENVENUE CHEZ FLASH DEAL</h1>';
    html += '<p style="text-align:center;color:#888;margin-bottom:40px;">Découvrez nos articles exclusifs</p>';
    html += '<input id="search" class="search" placeholder="🔍 Rechercher un article d\'exception..." onkeyup="sync()">';
    html += '<div id="list" class="grid"></div>';
    html += '<div class="chat-client"><h4 style="margin-top:0;color:#d4af37;">✨ CONSEILLER EN LIGNE</h4><div id="cc"></div><div class="chat-input-group"><input id="un" placeholder="Nom" style="width:35%"><input id="um" placeholder="Message..." style="width:65%" onkeypress="if(event.key===\'Enter\')sendC()"></div></div>';
    html += '<script>';
    html += 'function fact(n,p,a){ var w=window.open("",""); w.document.write("<html><body style=\'padding:40px;font-family:sans-serif;background:#f9f9f9;\'><div style=\'background:white;padding:30px;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.1);border-top:10px solid #d4af37;\'><h1>FLASH DEAL SHOP</h1><hr><h2>FACTURE CLIENT</h2><p><b>PRODUIT:</b> "+n+"</p><p><b>PRIX:</b> "+p+" MGA</p><p><b>LIVRAISON:</b> "+a+"</p><p><b>DATE:</b> "+new Date().toLocaleString()+"</p><hr><button onclick=\'window.print()\' style=\'padding:10px 20px;background:#d4af37;border:none;color:white;cursor:pointer;font-weight:bold;border-radius:5px;\'>IMPRIMER LA FACTURE</button></div></body></html>"); }';
    html += 'function sync(){ fetch("/api/sync?t="+Date.now()).then(r=>r.json()).then(db=>{';
    html += 'var s=document.getElementById("search").value.toLowerCase(); var h="";';
    html += 'db.p.forEach(p=>{ if(p.n.toLowerCase().indexOf(s)>-1){ h+="<div class=\'card\'><img src=\'"+(p.i||"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500")+"\'><div class=\'card-info\'><h3>"+p.n+"</h3><p style=\'color:#d4af37;font-size:22px;font-weight:bold;\'>"+p.p+" MGA</p><button class=\'btn\' onclick=\'buy(\\""+p.n+"\\","+p.p+")\'>Acquérir</button></div></div>"; } });';
    html += 'document.getElementById("list").innerHTML=h;';
    html += 'var mh=""; db.m.forEach(m=>{ var isA = (m.u==="ADMIN"); mh+="<div style=\'margin-bottom:8px;text-align:"+(isA?"left":"right")+"\'><span style=\'background:"+(isA?"#d4af37":"#222") +";color:"+(isA?"black":"white")+";padding:4px 10px;border-radius:8px;display:inline-block;\'><b>"+m.u+":</b> "+m.t+"</span></div>"; }); document.getElementById("cc").innerHTML=mh; document.getElementById("cc").scrollTop=9999;';
    html += '});}';
    html += 'function buy(n,p){ var a=prompt("Indiquez votre adresse de livraison prestigieuse :"); if(a)fetch("/api/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"buy",data:{n:n,p:p,a:a}})}).then(()=>{alert("Demande d\'acquisition transmise ! Voici votre facture."); fact(n,p,a); }); }';
    html += 'function sendC(){ var u=document.getElementById("un").value||"Client", m=document.getElementById("um").value; if(!m)return; fetch("/api/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"msg",data:{u:u,t:m}})}).then(()=>{document.getElementById("um").value="";sync();}); }';
    html += 'setInterval(sync,3000); sync(); </script></body></html>';
    res.send(html);
});

// --- ÉCOUTE DU PORT DYNAMIQUE (FIX POUR L'ERREUR 254) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { 
    console.log("Serveur FLASHDEAL en ligne sur le port " + PORT); 
});
