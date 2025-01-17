# Trivia Game

Un jeu de quiz multijoueur en temps réel développé avec Node.js, Socket.IO et SQLite.

## Description

Trivia Game est une application web permettant à plusieurs joueurs de participer à des quiz en temps réel. Les joueurs peuvent créer ou rejoindre des parties, répondre à des questions dans un temps limité et voir leurs scores en direct.

## Fonctionnalités

- Création et gestion de sessions de jeu
- Support multijoueur en temps réel
- Système de points basé sur la rapidité des réponses
- Timer de 10 secondes par question
- Gestion des déconnexions/reconnexions
- Interface utilisateur responsive et moderne
- Base de données SQLite pour stocker les questions

## Structure du Projet

```
trivia-game/
│
├── server.js          # Serveur Node.js et logique du jeu
├── index.html         # Interface utilisateur
├── questions.db       # Base de données SQLite des questions
└── README.md         # Documentation
```

## Prérequis

- Node.js (v12 ou supérieur)
- NPM (Node Package Manager)

## Installation

1. Clonez le repository :
```bash
git clone [url-du-repo]
cd trivia-game
```

2. Installez les dépendances :
```bash
npm install
```

## Configuration de la Base de Données

La base de données SQLite (`questions.db`) doit contenir une table `questions` avec la structure suivante :

```sql
CREATE TABLE questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    reponse1 TEXT NOT NULL,
    reponse2 TEXT NOT NULL,
    reponse3 TEXT NOT NULL,
    reponse4 TEXT NOT NULL,
    bonne_reponse INTEGER NOT NULL
);
```

## Lancement du Jeu

1. Démarrez le serveur :
```bash
node server.js
```

2. Ouvrez votre navigateur et accédez à :
```
http://localhost:3000
```

## Comment Jouer

1. **Créer une partie :**
   - Cliquez sur "Créer une partie"
   - Entrez votre pseudo
   - Choisissez le nombre de questions (5 ou 10)
   - Partagez le code de session avec les autres joueurs

2. **Rejoindre une partie :**
   - Cliquez sur "Rejoindre une partie"
   - Entrez le code de session
   - Choisissez votre pseudo
   - Attendez que l'hôte démarre la partie

3. **Pendant la partie :**
   - Lisez la question
   - Choisissez votre réponse avant la fin du timer (10 secondes)
   - Gagnez des points en fonction de votre rapidité :
     - 10 points si réponse dans les 5 premières secondes
     - 5 points si réponse entre 5 et 10 secondes
     - 2 points si réponse après 10 secondes

## Fonctionnalités Techniques

- Validation des pseudos (2-20 caractères, alphanumériques + tirets)
- Gestion automatique des sessions inactives
- Système de reconnexion automatique
- Interface responsive (mobile-friendly)
- Animations et retours visuels
- Système de points dynamique

## Dépendances Principales

- Express.js : Framework web
- Socket.IO : Communication en temps réel
- SQLite3 : Base de données 