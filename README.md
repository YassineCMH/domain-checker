# Domain Checker

Plateforme web pour vérifier la disponibilité et le certificat SSL de vos domaines.

---

## Lancement local (le plus simple)

**Prérequis :** Node.js 14+ installé — https://nodejs.org

```bash
# 1. Décompressez l'archive et entrez dans le dossier
cd domain-checker

# 2. Lancez le serveur
node server.js

# 3. Ouvrez dans votre navigateur
# http://localhost:3000
```

---

## Déploiement sur un serveur VPS / Linux

```bash
# Installez Node.js si besoin
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Copiez les fichiers sur votre serveur (ex: via scp ou FTP)
scp -r domain-checker/ user@votre-serveur:/home/user/

# Sur le serveur, lancez avec PM2 (garde l'app active en permanence)
npm install -g pm2
cd domain-checker
pm2 start server.js --name "domain-checker"
pm2 save
pm2 startup

# L'app tourne sur le port 3000
# Accédez via : http://votre-ip:3000
```

---

## Déploiement avec Nginx (port 80 / domaine propre)

```nginx
# /etc/nginx/sites-available/domain-checker
server {
    listen 80;
    server_name checker.votredomaine.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/domain-checker /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Déploiement sur Railway (gratuit, sans VPS)

1. Créez un compte sur https://railway.app
2. Nouveau projet → Deploy from GitHub repo (uploadez les 3 fichiers)
3. Railway détecte automatiquement Node.js et lance `npm start`
4. Votre app est disponible sur une URL publique en quelques minutes

---

## Déploiement sur Render (gratuit)

1. Créez un compte sur https://render.com
2. New → Web Service → connectez votre repo GitHub
3. Build Command : (vide)
4. Start Command : `node server.js`
5. Plan gratuit suffisant pour un usage personnel

---

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT`   | `3000` | Port d'écoute du serveur |

---

## Fonctionnalités

- ✅ Vérification du contenu actif (HTTP 200 + corps > 200 chars)
- ✅ Détection SSL/HTTPS valide
- ✅ Détection de redirection HTTP → HTTPS
- ✅ Code de statut HTTP
- ✅ Jusqu'à 200 domaines par batch
- ✅ Vérification parallèle (5 à la fois)
- ✅ Export CSV
- ✅ Filtres rapides
