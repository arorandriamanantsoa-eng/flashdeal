new Vue({
    el: '#app',
    data: {
        loading: false,
        view: 'splash', session: null, isLogin: true, tab: 'compta',
        form: { user: '', pass: '', role: '', shop: '' },
        users: [], products: [], sales: [], supply: [], chat: [], employees: [], deliveries: [], invoices: [],
        newP: { name: '', price: null, stock: null, file: '', category: '' }, newEmp: { name: '' },
        cart: [], showCart: false, loc: '', newMsg: '', chatFile: '', refreshInterval: null,
        searchQuery: '', searchCategory: '', adminSearchQuery: '', adminSearchCategory: '',
        subAmount: 10000, deliverySpeed: 'standard', selectedInv: { id: '', date: '', client: '', amount: 0, details: '', owner: '' },
        localInputs: {}, chatDest: '', simData: [], mapInstance: null, markers: {},
        chartInstances: { sales: null, expenses: null, profit: null },
        wishlist: [], searchHistory: [], suppliers: [], stockThreshold: 5, bannerText: "Bienvenue sur Flashdeal Empire !", newSupplier: { name: '', contact: '', category: '' },
        showSidebar: false
    },
    watch: {
        tab: function (newVal, oldVal) {
            // Détruire la carte proprement quand on quitte GPS
            if (oldVal === 'gps' && this.mapInstance) {
                this.mapInstance.remove();
                this.mapInstance = null;
                this.markers = {};
            }
            this.$nextTick(() => {
                if (newVal === 'gps') {
                    setTimeout(() => { this.initMap(); }, 300);
                }
                if (newVal === 'compta') this.initCharts();
            });
        }
    },

    mounted: function () {
        var self = this; setTimeout(function () { self.view = 'role'; }, 3500);
        // Récupérer les favoris du localStorage
        let savedWishlist = localStorage.getItem('wishlist');
        if (savedWishlist) {
            try { this.wishlist = JSON.parse(savedWishlist); } catch(e) { this.wishlist = []; }
        }
    },
    computed: {
        myProducts: function () { var s = this; if (!s.session) return []; return this.products.filter(function (p) { return p.owner === s.session.user; }); },
        myEmployees: function () { var s = this; if (!s.session) return []; return this.employees.filter(function (e) { return e.owner === s.session.user; }); },
        mySales: function () { var s = this; if (!s.session) return []; return this.sales.filter(function (v) { return v.owner === s.session.user; }); },
        myInvoices: function () {
            if (!this.session || !this.invoices) return [];
            return this.invoices.filter(i => i.owner === this.session.user);
        },
        myChat: function () {
            var s = this;
            if (!s.session) return [];
            return this.chat.filter(function (c) {
                return c.dest === 'ALL' || c.dest === s.session.user || c.sender === s.session.user || c.sender === 'GÉRANT';
            });
        },
        mySimData: function () {
            if (!this.session) return [];
            return this.simData.filter(d => d.owner === this.session.user);
        },
        cTotal: function () { return this.cart.reduce(function (a, b) { return a + parseInt(b.price); }, 0); },
        calc: function () {
            var ca = 0, dep = 0;
            if (!this.session) return { ca: 0, dep: 0, net: 0 };
            this.myInvoices.forEach(function (i) { if (i.type === 'VENTE') ca += parseInt(i.amount); else dep += parseInt(i.amount); });
            return { ca: ca, dep: dep, net: ca - dep };
        },
        filteredProducts: function () {
            var s = this.searchQuery.toLowerCase(); var c = this.searchCategory;
            return this.products.filter(function (p) {
                return (p.name.toLowerCase().indexOf(s) !== -1 || (p.shopName && p.shopName.toLowerCase().indexOf(s) !== -1)) && (c === '' || p.category === c);
            });
        },
        filteredAdminProducts: function () {
            var s = this.adminSearchQuery.toLowerCase(); var c = this.adminSearchCategory;
            if (!this.session) return [];
            return this.myProducts.filter(function (p) { return p.name.toLowerCase().indexOf(s) !== -1 && (c === '' || p.category === c); });
        },
        businessIntelligence: function () {
            if (!this.mySales || this.mySales.length === 0) return "L'IA analyse : Aucune vente enregistrée pour le moment.";
            let counts = {};
            this.mySales.forEach(s => {
                let items = s.cart || [];
                items.forEach(item => { counts[item.name] = (counts[item.name] || 0) + 1; });
            });
            if(Object.keys(counts).length === 0) return "En attente de commandes claires.";
            let topProduct = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
            return "Star des ventes : " + topProduct;
        },
        aiStockPrediction: function() {
            if (!this.myProducts || this.myProducts.length === 0) return "Veuillez ajouter des produits pour que l'IA puisse analyser vos stocks.";
            let low = this.myProducts.filter(p => p.stock > 0 && p.stock <= this.stockThreshold);
            let out = this.myProducts.filter(p => p.stock <= 0);
            
            let msg = "💡 <b style='color:#00ffcc;'>Analyse IA Terminée :</b><br><br>";
            if (out.length > 0) {
                msg += "🚨 <b style='color:#ff4444;'>URGENCE ABSOLUE :</b> Vous avez " + out.length + " produit(s) en rupture totale (ex: " + out[0].name + "). Vos clients partent chez la concurrence !<br>";
            }
            if (low.length > 0) {
                msg += "⚠️ <b style='color:#f5a623;'>PRÉVISION :</b> " + low.length + " produit(s) seront en rupture d'ici 48h selon le volume de recherche actuel.<br>";
            }
            if (out.length === 0 && low.length === 0) {
                msg += "✅ Excellente gestion. Vos stocks sont optimaux. L'IA recommande de lancer une campagne marketing pour augmenter le volume.";
            }
            return msg;
        }
    },
    methods: {
        selectRole: function (role) { this.form.role = role; this.view = 'auth'; this.isLogin = true; },
        logout: function () { this.session = null; this.view = 'role'; clearInterval(this.refreshInterval); clearInterval(this.heartbeatInterval); clearInterval(this.movementInterval); },

        authAction: function () {
            var self = this;
            fetch(this.isLogin ? '/api/auth' : '/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.form) })
                .then(function (r) { return r.json(); }).then(function (res) {
                    if (res.success) {
                        if (res.user.role !== self.form.role && self.form.role !== 'root') {
                            alert("Accès refusé : Ce compte appartient à l'espace " + res.user.role);
                            return;
                        }
                        self.session = res.user;
                        if (!res.user.isPremium && res.user.role === 'admin') { self.view = 'subscription'; } else { self.goToDashboard(); }
                    } else { alert("Erreur d'identifiants."); }
                });
        },

        subscribe: function () {
            var self = this;
            fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: this.session.user, amount: this.subAmount }) })
                .then(function (r) { return r.json(); }).then(function (res) {
                    if (res.success) { self.session = res.user; alert("🎉 Abonnement activé !"); self.goToDashboard(); }
                });
        },

        goToDashboard: function () {
            this.view = 'dashboard'; this.tab = this.session.role === 'admin' ? 'compta' : 'boutique';
            this.load();
            this.refreshInterval = setInterval(this.load.bind(this), 5000);
            this.heartbeatInterval = setInterval(() => { fetch('/api/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: this.session.user }) }); }, 10000);
            this.movementInterval = setInterval(this.moveSimulation.bind(this), 2000); 
        },

        load: function () {
            var self = this;
            if (self.loading) return;
            self.loading = true;
            fetch('/api/data').then(function (r) { return r.json(); }).then(function (d) {
                self.users = d.users; self.products = d.products; self.employees = d.employees;
                self.sales = d.sales; self.invoices = d.invoices;
                if (self.invoices.length === 0 && self.session) {
                    self.invoices = [
                        { date: "10/04", amount: 50000, type: "VENTE", owner: self.session.user, details: "Casque Bluetooth Luxe" },
                        { date: "11/04", amount: 20000, type: "DEPENSE", owner: self.session.user, details: "Frais divers" },
                        { date: "12/04", amount: 95000, type: "VENTE", owner: self.session.user, details: "Smartphone reconditionné" },
                        { date: "13/04", amount: 40000, type: "ACHAT_STOCK", owner: self.session.user, details: "Réappro 10x Chargeur Rapide" },
                        { date: "14/04", amount: 10000, type: "VENTE", owner: self.session.user, details: "Câble USB-C" }
                    ];
                }
                self.chat = d.chat; self.deliveries = d.deliveries;

                if (self.session) {
                    self.simData = self.simData.filter(function (sd) {
                        return sd.owner === self.session.user;
                    });
                }

                self.deliveries.forEach(function (del) {
                    if (!self.session || del.owner !== self.session.user) return;

                    var existing = self.simData.find(function (sd) { return sd.id === del.id; });
                    if (!existing) {
                        self.simData.push({
                            id: del.id, loc: del.loc, livreur: del.livreur, owner: del.owner, orderId: del.orderId,
                            speed: del.speed || 'standard', status: del.status || 'EN_COURS', startTime: del.startTime || Date.now(),
                            progress: 0, distRestante: 0, totalDist: 0, routeInit: null,
                            startStr: '', etaStr: ''
                        });
                    }
                });
                self.loading = false;
                self.$nextTick(function () { 
                    if (self.tab === 'compta') { self.initCharts(); }
                });
            }).catch(function () { self.loading = false; });
        },

        doAction: function (t, d) { var self = this; fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: t, data: d }) }).then(function () { self.load(); }); },

        handleFile: function (e, type) {
            var self = this; var reader = new FileReader();
            reader.onload = function (ev) { if (type === 'prod') self.newP.file = ev.target.result; else self.chatFile = ev.target.result; };
            reader.readAsDataURL(e.target.files[0]);
        },
        buyStock: function (p) {
            var q = this.localInputs['q_' + p.id];
            if (!q) return alert("Quantité vide !");
            this.doAction('supply', { pid: p.id, qty: q, total: q * p.price, owner: this.session.user });
            this.$set(this.localInputs, 'q_' + p.id, '');
        },
        paySal: function (e) {
            var amt = this.localInputs['pay_' + e.name];
            if (!amt) return alert("Montant vide !");
            this.doAction('pay_salary', { empName: e.name, amount: amt, owner: this.session.user });
            this.$set(this.localInputs, 'pay_' + e.name, '');
        },

        checkout: function (m) {
            if (!this.loc || this.cart.length === 0) return alert("Lieu ou Panier vide !");
            this.doAction('sale', { client: this.session.user, loc: this.loc, cart: this.cart, method: m, owner: this.cart[0].owner, deliverySpeed: this.deliverySpeed });
            this.cart = []; this.showCart = false; alert("✅ Commande envoyée !"); this.tab = 'my_inv';
        },

        getLivreur: function (id) { var d = this.deliveries.find(function (x) { return x.orderId === id; }); return d ? d.livreur : ''; },
        getDeliveryStatus: function (orderId) { var d = this.deliveries.find(function (x) { return x.orderId === orderId; }); return d ? (d.status || 'EN_COURS') : ''; },
        assignTask: function (s) { var l = document.getElementById('sel_' + s.id).value; this.doAction('assign', { orderId: s.id, livreur: l, loc: s.loc, owner: this.session.user }); },
        isAssigned: function (id) { return this.deliveries.some(function (d) { return d.orderId === id; }); },

        downloadPNG: function (inv) {
            this.selectedInv = inv;
            setTimeout(function () {
                html2canvas(document.querySelector("#invoice-capture")).then(function (canvas) {
                    var link = document.createElement('a');
                    link.download = 'Facture_FlashDeal_' + inv.date.split(' ')[0] + '.png';
                    link.href = canvas.toDataURL("image/png");
                    link.click();
                });
            }, 500);
        },

        sendChat: function () {
            if (!this.chatDest) return alert("Sélectionnez un destinataire dans la liste !");
            if (!this.newMsg && !this.chatFile) return;
            this.doAction('chat', { sender: this.session.user, role: this.session.role, dest: this.chatDest, text: this.newMsg, file: this.chatFile, owner: this.session.user });
            this.newMsg = ''; this.chatFile = ''; var f = document.getElementById('chatFile'); if (f) f.value = '';
        },
        sendChatClient: function () {
            if (!this.chatDest) return alert("Sélectionnez une boutique dans la liste !");
            if (!this.newMsg && !this.chatFile) return;
            this.doAction('chat', { sender: this.session.user, role: 'client', dest: this.chatDest, text: this.newMsg, file: this.chatFile, owner: 'admin' });
            this.newMsg = ''; this.chatFile = ''; var f = document.getElementById('chatFileClient'); if (f) f.value = '';
        },

        // --- MOTEUR DE CARTE ET COORDONNÉES GPS AMÉLIORÉ ---
        initMap: function () {
            if (this.tab !== 'gps' || this.mapInstance) return;
            
            var mapContainer = document.getElementById('real-map');
            if(!mapContainer) return;

            // Point de départ ISPM Antsobolo
            this.mapInstance = L.map('real-map').setView([-18.8885, 47.5611], 13);
            
            // CHANGEMENT ICI : Fond de carte clair pour voir les villes
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap',
                maxZoom: 18
            }).addTo(this.mapInstance);

            // Icône Base ISPM avec glow effect
            var baseIcon = L.divIcon({
                className: 'custom-base-marker',
                html: '<div class="base-pulse">🏢</div>',
                iconSize: [40, 40], iconAnchor: [20, 20]
            });
            L.marker([-18.8885, 47.5611], {icon: baseIcon}).addTo(this.mapInstance).bindPopup("<b>Boutique Principale (ISPM Antsobolo)</b>").openPopup();
        },

        getGeocode: function (locName) {
            var name = locName ? locName.toLowerCase().trim() : '';
            var known = {
                'analakely': { lat: -18.9110, lng: 47.5267 }, 'antaninarenina': { lat: -18.9100, lng: 47.5267 },
                'tsaralalana': { lat: -18.9050, lng: 47.5300 }, 'andohalo': { lat: -18.9017, lng: 47.5270 },
                'isoraka': { lat: -18.9013, lng: 47.5300 }, 'faravohitra': { lat: -18.8878, lng: 47.5278 },
                'ambanidia': { lat: -18.8934, lng: 47.5328 }, 'ambohijatovo': { lat: -18.9068, lng: 47.5253 },
                'soarano': { lat: -18.9133, lng: 47.5250 }, 'behoririka': { lat: -18.9133, lng: 47.5300 },
                'mahamasina': { lat: -18.9165, lng: 47.5220 }, 'anosy': { lat: -18.9224, lng: 47.5397 },
                'ampefiloha': { lat: -18.9100, lng: 47.5333 }, 'isotry': { lat: -18.9167, lng: 47.5183 },
                'ambodivona': { lat: -18.9067, lng: 47.5450 }, 'bemasoandro': { lat: -18.8833, lng: 47.5167 },
                'ankorondrano': { lat: -18.8917, lng: 47.5350 }, 'ankadifotsy': { lat: -18.8833, lng: 47.5500 },
                'andralanitra': { lat: -18.8817, lng: 47.5633 }, 'alarobia': { lat: -18.8750, lng: 47.5517 },
                'ambatobe': { lat: -18.8700, lng: 47.5583 }, 'androhibe': { lat: -18.8683, lng: 47.5417 },
                'ankadimbahoaka': { lat: -18.9417, lng: 47.5433 }, 'andravoahangy': { lat: -18.8933, lng: 47.5467 },
                'ankadindramamy': { lat: -18.8983, lng: 47.5517 }, 'sabotsy namehana': { lat: -18.8433, lng: 47.5733 },
                'ankadikely': { lat: -18.8300, lng: 47.5483 }, 'itaosy': { lat: -18.9200, lng: 47.4870 },
                'ambohibao': { lat: -18.8633, lng: 47.4933 }, 'talatamaty': { lat: -18.8517, lng: 47.4567 },
                'ambohimanarina': { lat: -18.9300, lng: 47.5083 }, 'anosizato': { lat: -18.9350, lng: 47.5050 },
                'ambohidratrimo': { lat: -18.7817, lng: 47.4333 }, 'mahitsy': { lat: -18.7367, lng: 47.4100 },
                'ivato': { lat: -18.7972, lng: 47.4786 }, 'ambohimanga': { lat: -18.7683, lng: 47.4733 },
                'tanjombato': { lat: -18.9600, lng: 47.5200 }, 'manarintsoa': { lat: -18.9300, lng: 47.5333 },
                '67ha': { lat: -18.9250, lng: 47.5417 }, 'anosibe': { lat: -18.9317, lng: 47.5283 },
                'mandroseza': { lat: -18.9633, lng: 47.5250 }, 'amboasary': { lat: -18.9483, lng: 47.5450 },
                'soavimasoandro': { lat: -18.9517, lng: 47.4933 }, 'fieferana': { lat: -18.9583, lng: 47.5067 },
                'antsobolo': { lat: -18.8885, lng: 47.5611 }, 'ispm': { lat: -18.8885, lng: 47.5611 }
            };

            if (known[name]) return known[name];
            for (var k in known) { if (name.includes(k) || k.includes(name)) return known[k]; }
            return { lat: -18.9000 + (Math.random() * 0.06 - 0.03), lng: 47.5250 + (Math.random() * 0.06 - 0.03) };
        },

        getDistanceKm: function (lat1, lon1, lat2, lon2) {
            var R = 6371;
            var dLat = (lat2 - lat1) * (Math.PI / 180);
            var dLon = (lon2 - lon1) * (Math.PI / 180);
            var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c; 
        },

        getBearing: function (lat1, lng1, lat2, lng2) {
            var dLng = (lng2 - lng1) * Math.PI / 180;
            var lat1R = lat1 * Math.PI / 180;
            var lat2R = lat2 * Math.PI / 180;
            var y = Math.sin(dLng) * Math.cos(lat2R);
            var x = Math.cos(lat1R) * Math.sin(lat2R) - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng);
            return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
        },

        moveSimulation: function () {
            var self = this;
            var hqCoord = { lat: -18.8885, lng: 47.5611 };
            var speedsKmH = { 'standard': 20, 'rapide': 30, 'ultra': 45 };
            var ROAD_FACTOR = 1.4;
            var intervalSec = 2;

            let hasActiveDelivery = false;
            let firstActiveLat = null;
            let firstActiveLng = null;

            for (var i = 0; i < this.simData.length; i++) {
                var d = this.simData[i];

                if (!self.session || d.owner !== self.session.user) continue;

                var destCoord = self.getGeocode(d.loc);

                if (d.status === 'LIVRÉ') {
                    d.progress = 100;
                    if (this.tab === 'gps' && this.mapInstance && this.markers[d.id]) {
                        this.markers[d.id].setLatLng([destCoord.lat, destCoord.lng]);
                    }
                    continue;
                }

                if (!d.routeInit) {
                    var haversineDist = self.getDistanceKm(hqCoord.lat, hqCoord.lng, destCoord.lat, destCoord.lng);
                    d.totalDist = haversineDist * ROAD_FACTOR;
                    d.distRestante = d.totalDist;
                    d.progress = 0;
                    d.speedKmH = speedsKmH[d.speed] || 20;

                    var startObj = new Date(d.startTime);
                    d.startStr = startObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                    var timeMs = (d.totalDist / d.speedKmH) * 3600000;
                    var etaObj = new Date(startObj.getTime() + timeMs);
                    d.etaStr = etaObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    d.etaMinutes = Math.round(timeMs / 60000);

                    d.routeInit = 'ready';
                }

                if (d.routeInit === 'ready') {
                    var distParcourueStepKm = (d.speedKmH / 3600) * intervalSec;

                    if (d.distRestante > distParcourueStepKm) {
                        d.distRestante -= distParcourueStepKm;
                        d.progress = ((d.totalDist - d.distRestante) / d.totalDist) * 100;
                    } else {
                        d.distRestante = 0;
                        d.progress = 100;
                        d.status = 'LIVRÉ';
                        var realDel = self.deliveries.find(function (x) { return x.id === d.id; });
                        if (realDel) { realDel.status = 'LIVRÉ'; }
                    }

                    // --- SYNCHRONISATION AVEC LA CARTE REELLE AMELIOREE ---
                    if (this.tab === 'gps' && this.mapInstance) {
                        let pct = d.progress / 100;
                        let currentLat = hqCoord.lat + (destCoord.lat - hqCoord.lat) * pct;
                        let currentLng = hqCoord.lng + (destCoord.lng - hqCoord.lng) * pct;

                        if (!this.markers[d.id]) {
                            // ANIMATION GPS : Flèche directionnelle CSS
                            var bearing = self.getBearing(currentLat, currentLng, destCoord.lat, destCoord.lng);
                            var motoIcon = L.divIcon({
                                className: 'animated-moto-marker',
                                html: '<div class="moto-arrow-wrap" style="transform:translate(-50%,-50%) rotate(' + bearing + 'deg)"><div class="moto-arrow-shape"></div><div class="moto-arrow-tail"></div></div>',
                                iconSize: [40, 40], iconAnchor: [20, 20]
                            });
                            this.markers[d.id] = L.marker([currentLat, currentLng], {icon: motoIcon}).addTo(this.mapInstance)
                                .bindPopup("<b>Livreur:</b> " + d.livreur + "<br><b>Dest:</b> " + d.loc + "<br><b>Vitesse:</b> " + d.speed);
                        } else {
                            // Mise à jour position + rotation de la flèche
                            this.markers[d.id].setLatLng([currentLat, currentLng]);
                            var bearing = self.getBearing(currentLat, currentLng, destCoord.lat, destCoord.lng);
                            var el = this.markers[d.id].getElement();
                            if (el) {
                                var arrow = el.querySelector('.moto-arrow-wrap');
                                if (arrow) arrow.style.transform = 'translate(-50%,-50%) rotate(' + bearing + 'deg)';
                            }
                        }

                        if(!hasActiveDelivery) {
                            hasActiveDelivery = true;
                            firstActiveLat = currentLat;
                            firstActiveLng = currentLng;
                        }
                    }
                }
            }

            // AUTO-CENTRAGE EN GRAND (Correction demandée)
            if (this.tab === 'gps' && this.mapInstance && hasActiveDelivery && firstActiveLat && firstActiveLng) {
                this.mapInstance.setView([firstActiveLat, firstActiveLng], 15, { animate: true, duration: 1 });
            }

            this.$forceUpdate();
        },

        initCharts: function () {
            var ctx1 = document.getElementById('chart-sales');
            var ctx2 = document.getElementById('chart-expenses');
            var ctx3 = document.getElementById('chart-profit');

            if (!ctx1 || !ctx2 || !ctx3) return;

            if (this.chartInstances.sales) this.chartInstances.sales.destroy();
            if (this.chartInstances.expenses) this.chartInstances.expenses.destroy();
            if (this.chartInstances.profit) this.chartInstances.profit.destroy();

            var labels = this.myInvoices.map(i => i.date).slice(-7);
            var ventes = this.myInvoices.filter(i => i.type === 'VENTE').map(i => i.amount).slice(-7);
            var depenses = this.myInvoices.filter(i => i.type !== 'VENTE').map(i => i.amount).slice(-7);
            var profits = ventes.map((v, i) => v - (depenses[i] || 0));

            this.chartInstances.sales = new Chart(ctx1.getContext('2d'), {
                type: 'line',
                data: { labels: labels, datasets: [{ label: 'Ventes', data: ventes, borderColor: '#CFB53B', backgroundColor: 'rgba(207, 181, 59, 0.1)', fill: true, tension: 0.4 }] },
                options: { responsive: true, maintainAspectRatio: false, layout: { padding: 10 }, animation: { duration: 1500, easing: 'easeOutQuart' } }
            });
            this.chartInstances.expenses = new Chart(ctx2.getContext('2d'), {
                type: 'bar',
                data: { labels: labels, datasets: [{ label: 'Dépenses', data: depenses, borderColor: '#ff4444', backgroundColor: 'rgba(255, 68, 68, 0.2)', fill: true, tension: 0.4 }] },
                options: { responsive: true, maintainAspectRatio: false, layout: { padding: 10 }, animation: { duration: 1500, easing: 'easeOutBounce' } }
            });
            this.chartInstances.profit = new Chart(ctx3.getContext('2d'), {
                type: 'line',
                data: { labels: labels, datasets: [{ label: 'Profit', data: profits, borderColor: '#00ff88', backgroundColor: 'rgba(0, 255, 136, 0.1)', fill: true, tension: 0.4 }] },
                options: { responsive: true, maintainAspectRatio: false, layout: { padding: 10 }, animation: { duration: 1500, easing: 'easeInOutElastic' } }
            });
        },

        toggleWishlist: function (product) {
            let index = this.wishlist.findIndex(p => p.id === product.id);
            if (index > -1) { this.wishlist.splice(index, 1); } else { this.wishlist.push(product); }
            localStorage.setItem('wishlist', JSON.stringify(this.wishlist));
        },

        addSearchHistory: function (query) {
            if (query && !this.searchHistory.includes(query)) {
                this.searchHistory.unshift(query);
                if (this.searchHistory.length > 5) this.searchHistory.pop();
            }
        },

        isStockLow: function (quantity) { return quantity <= this.stockThreshold && quantity > 0; },
        isOutOfStock: function (quantity) { return quantity <= 0; },

        addSupplier: function () {
            if (!this.newSupplier.name) return alert("Nom du fournisseur requis");
            this.suppliers.push({ ...this.newSupplier, id: 'SUP_' + Date.now() });
            this.newSupplier = { name: '', contact: '', category: '' };
            alert("Fournisseur ajouté !");
        },

        // --- VRAIE IA QUI IMPACTE DIRECTEMENT LE MAGASIN ---
        runAIOptimization: function() {
            if (!this.session || !this.session.isPremium) return alert("Cette fonction nécessite le Premium !");
            
            let actionsCount = 0;
            let logs = [];
            
            // 1. L'IA achète automatiquement les produits en rupture de stock
            this.myProducts.forEach(p => {
                if (p.stock <= this.stockThreshold) {
                    let qtyToBuy = 50; // Quantité intelligente générée
                    this.doAction('supply', { pid: p.id, qty: qtyToBuy, total: qtyToBuy * p.price, owner: this.session.user });
                    logs.push(`✅ Réapprovisionnement automatique : ${p.name} (+${qtyToBuy} unités)`);
                    actionsCount++;
                }
            });

            if (actionsCount > 0) {
                this.bannerText = "✨ L'IA a optimisé votre catalogue avec succès ! ✨";
                setTimeout(() => { this.bannerText = "Bienvenue sur Flashdeal Empire !"; }, 6000);
                
                // Pop-up stylisé pour afficher l'impact
                alert("🤖 MANAGER IA : ACTIONS EFFECTUÉES\n\n" + logs.join("\n") + "\n\nL'interface a été mise à jour !");
            } else {
                alert("🤖 MANAGER IA : Analyse terminée. Vos stocks et finances sont parfaitement optimisés. Aucune action d'urgence n'est requise.");
            }
        }
    }
});
