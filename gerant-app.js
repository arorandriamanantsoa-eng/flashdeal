new Vue({
    el: '#gerant-app',
    data: { users: [], subscriptions: [], chat: [], sales: [], deliveries: [], products: [], newMsg: '', loading: false, chartInstances: {} },
    computed: {
        patrons: function () { return this.users.filter(u => u.role === 'admin'); },
        clients: function () { return this.users.filter(u => u.role === 'client'); },
        totalCompta: function () {
            return this.subscriptions.reduce((total, sub) => total + (parseInt(sub.amount) || 0), 0);
        },
        salesByDay: function () {
            let map = {};
            this.sales.forEach(s => { let d = (s.date || '').split(' ')[0]; if (!map[d]) map[d] = 0; map[d]++; });
            return map;
        },
        liveStats: function () {
            return {
                activeUsers: this.users.filter(u => u.isActive).length || this.users.length,
                activeDeliveries: this.deliveries.filter(d => d.status !== 'LIVRÉ').length,
                messages: this.chat.length
            };
        },
        fraudAlerts: function () {
            let alerts = [];
            this.sales.forEach(s => {
                if (s.cart && s.cart.length > 10) {
                    alerts.push("⚠️ Achat massif suspect ID: " + s.id);
                }
                if (s.amount > 1000000) {
                    alerts.push("💰 Transaction énorme ID: " + s.id);
                }
            });
            return alerts;
        },
        predictedSales: function () {
            let values = Object.values(this.salesByDay);
            if (values.length < 2) return 0;
            let growth = 0;
            for (let i = 1; i < values.length; i++) {
                growth += (values[i] - values[i - 1]);
            }
            let avgGrowth = growth / (values.length - 1);
            let last = values[values.length - 1];
            return Math.round(last + avgGrowth);
        },
    },
    methods: {
        async fetchData() {
            try {
                this.loading = true;
                const res = await fetch('/api/gerant/data');
                if (!res.ok) {
                    throw new Error('Erreur serveur');
                }
                const data = await res.json();
                this.users = data.users || [];
                this.subscriptions = data.subscriptions || [];
                this.chat = data.chat || [];
                this.sales = data.sales || [];
                this.deliveries = data.deliveries || [];
                this.products = data.products || [];
                // Dessiner les graphiques une fois les données chargées
                this.$nextTick(() => { this.initRootCharts(); });
            } catch (err) {
                console.error("Erreur fetchData Gérant: ", err);
            } finally {
                this.loading = false;
            }
        },
        initRootCharts() {
            var ctxGlobal = document.getElementById('globalSalesChart');
            var ctxRev = document.getElementById('revenueChart');
            if (!ctxGlobal || !ctxRev) return;

            let labels = Object.keys(this.salesByDay);
            let data = Object.values(this.salesByDay);

            if (this.chartInstances.rootSales) {
                this.chartInstances.rootSales.data.labels = labels;
                this.chartInstances.rootSales.data.datasets[0].data = data;
                this.chartInstances.rootSales.update();
            } else {
                this.chartInstances.rootSales = new Chart(ctxGlobal, {
                    type: 'line',
                    data: { labels: labels, datasets: [{ label: 'Ventes du réseau / jour', data: data, borderColor: '#00ffcc', backgroundColor: 'rgba(0, 255, 204, 0.1)', fill: true, tension: 0.4 }] },
                    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
                });
            }
            if (this.chartInstances.rootRev) {
                this.chartInstances.rootRev.data.labels = labels;
                this.chartInstances.rootRev.data.datasets[0].data = data.map(v => v * 15000);
                this.chartInstances.rootRev.update();
            } else {
                this.chartInstances.rootRev = new Chart(ctxRev, {
                    type: 'bar',
                    data: { labels: labels, datasets: [{ label: 'Volume financier (Estimé)', data: data.map(v => v * 15000), backgroundColor: '#D4AF37' }] },
                    options: { responsive: true, maintainAspectRatio: false }
                });
            }
        },
        async gerantAction(actionType, username) {
            const msg = actionType === 'ban' ? "Détruire le compte de " + username + " ?" : "Enlever l'abonnement de " + username + " ?";
            if (!confirm("⚠️ " + msg))
                return;
            try {
                const res = await fetch('/api/gerant/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: actionType, user: username })
                });
                if (!res.ok) {
                    throw new Error("Erreur action");
                }
                await this.fetchData();
                alert("Action effectuée avec succès !");
            } catch (err) {
                console.err("Erreur action Gérant:", err);
            }
        },
        async sendGerantChat() {
            if (!this.newMsg || !this.newMsg.trim()) return;
            try {
                const res = await fetch('/api/gerant/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: this.newMsg.trim() })
                });
                if (!res.ok) {
                    throw new Error("Erreur envoi message");
                }
                this.newMsg = '';
                await this.fetchData();
            } catch (err) {
                console.error("Erreur chat Gérant:", err);
            }
        },
        resetAll() {
            if (!confirm("⚠️ TOUT SUPPRIMER (Sauf Utilisateurs) ? C'est irréversible !")) return;
            fetch('/api/root/reset', { method: 'POST' }).then(() => { alert("🔥 Système réinitialisé"); this.fetchData(); });
        },
        deleteAllUsers() {
            if (!confirm("⚠️ SUPPRIMER TOUS LES UTILISATEURS ?")) return;
            fetch('/api/root/delete-users', { method: 'POST' }).then(() => { alert("🧨 Tous les utilisateurs supprimés"); this.fetchData(); });
        }
    },
    mounted() {
        this.fetchData();
        this.interval = setInterval(() => {
            this.fetchData();
        }, 5000);
    },
    beforeDestroy() {
        //evite fuite memoire
        clearInterval(this.interval);
    }
});
