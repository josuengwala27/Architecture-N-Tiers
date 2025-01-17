const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./questions.db');

const questions = [
    {
        question: "Quelle est la capitale de la France ?",
        reponse1: "Paris",
        reponse2: "Londres",
        reponse3: "Berlin",
        reponse4: "Madrid",
        bonne_reponse: 1
    },
    {
        question: "Quel est le plus grand océan du monde ?",
        reponse1: "Atlantique",
        reponse2: "Indien",
        reponse3: "Pacifique",
        reponse4: "Arctique",
        bonne_reponse: 3
    },
    {
        question: "Qui a peint la Joconde ?",
        reponse1: "Van Gogh",
        reponse2: "Leonard de Vinci",
        reponse3: "Picasso",
        reponse4: "Michel-Ange",
        bonne_reponse: 2
    },
    {
        question: "En quelle année a eu lieu la Révolution française ?",
        reponse1: "1789",
        reponse2: "1799",
        reponse3: "1769",
        reponse4: "1809",
        bonne_reponse: 1
    },
    {
        question: "Quel est l'élément chimique le plus abondant dans l'univers ?",
        reponse1: "Oxygène",
        reponse2: "Carbone",
        reponse3: "Hydrogène",
        reponse4: "Azote",
        bonne_reponse: 3
    }
];

db.serialize(() => {
    // Créer la table si elle n'existe pas
    db.run(`CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        reponse1 TEXT NOT NULL,
        reponse2 TEXT NOT NULL,
        reponse3 TEXT NOT NULL,
        reponse4 TEXT NOT NULL,
        bonne_reponse INTEGER NOT NULL
    )`);

    // Supprimer toutes les questions existantes
    db.run('DELETE FROM questions', (err) => {
        if (err) {
            console.error('Erreur lors de la suppression des questions:', err);
            return;
        }
        console.log('Questions existantes supprimées.');

        // Préparer la requête d'insertion
        const stmt = db.prepare('INSERT INTO questions (question, reponse1, reponse2, reponse3, reponse4, bonne_reponse) VALUES (?, ?, ?, ?, ?, ?)');

        // Insérer chaque question
        questions.forEach((q) => {
            stmt.run(q.question, q.reponse1, q.reponse2, q.reponse3, q.reponse4, q.bonne_reponse);
        });

        // Finaliser la requête préparée
        stmt.finalize();

        console.log('Questions de test ajoutées avec succès !');
    });
});

// Fermer la connexion à la base de données
db.close(); 