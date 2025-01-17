const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware pour servir les fichiers statiques
app.use(express.static(path.join(__dirname)));

// Gestion des erreurs de la base de données
class DatabaseError extends Error {
    constructor(message, query = null) {
        super(message);
        this.name = 'DatabaseError';
        this.query = query;
        this.timestamp = new Date();
    }
}

// Initialisation de la base de données avec gestion d'erreurs
let db = null;
function initDatabase() {
    try {
        db = new sqlite3.Database('./questions.db', (err) => {
            if (err) {
                console.error('Erreur fatale lors de l\'ouverture de la base de données:', err.message);
                process.exit(1); // Arrêter le serveur si la BD est inaccessible
            }
            console.log('Connexion à la base de données SQLite réussie.');
            
            // Création de la table avec gestion d'erreurs
            createQuestionsTable();
        });

        // Gestion des erreurs de la base de données
        db.on('error', (err) => {
            console.error('Erreur de base de données:', err);
            // Tentative de reconnexion
            setTimeout(initDatabase, 5000);
        });
    } catch (err) {
        console.error('Erreur lors de l\'initialisation de la base de données:', err);
        setTimeout(initDatabase, 5000);
    }
}

// Création de la table questions avec validation
function createQuestionsTable() {
    const query = `
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL CHECK (length(question) > 0),
            reponse1 TEXT NOT NULL CHECK (length(reponse1) > 0),
            reponse2 TEXT NOT NULL CHECK (length(reponse2) > 0),
            reponse3 TEXT NOT NULL CHECK (length(reponse3) > 0),
            reponse4 TEXT NOT NULL CHECK (length(reponse4) > 0),
            bonne_reponse INTEGER NOT NULL CHECK (bonne_reponse BETWEEN 1 AND 4)
        )
    `;

    db.run(query, (err) => {
        if (err) {
            console.error('Erreur lors de la création de la table:', err.message);
            throw new DatabaseError('Erreur de création de table', query);
        }
        console.log('Table "questions" prête.');
        
        // Vérifier qu'il y a des questions dans la base
        verifyQuestionsExist();
    });
}

// Vérification de l'existence des questions
function verifyQuestionsExist() {
    db.get('SELECT COUNT(*) as count FROM questions', [], (err, row) => {
        if (err) {
            console.error('Erreur lors de la vérification des questions:', err.message);
            return;
        }
        
        if (row.count === 0) {
            console.warn('Attention: Aucune question dans la base de données!');
        } else {
            console.log(`Base de données initialisée avec ${row.count} questions.`);
        }
    });
}

// Fonction améliorée pour récupérer des questions aléatoires
function getRandomQuestions(n, callback) {
    console.log('Tentative de récupération de', n, 'questions');
    
    if (!db) {
        console.error('Base de données non disponible');
        callback({ error: 'Base de données non disponible' });
        return;
    }

    // Vérifier d'abord le nombre total de questions disponibles
    db.get('SELECT COUNT(*) as count FROM questions', [], (err, row) => {
        if (err) {
            console.error('Erreur lors du comptage des questions:', err.message);
            callback({ error: 'Erreur lors de la récupération des questions' });
            return;
        }

        console.log('Nombre total de questions dans la BD:', row.count);

        if (row.count < n) {
            console.error(`Pas assez de questions disponibles (${row.count} disponibles, ${n} demandées)`);
            callback({ error: `Pas assez de questions disponibles (${row.count} disponibles, ${n} demandées)` });
            return;
        }

        // Récupérer les questions aléatoires
        const query = `SELECT * FROM questions 
             WHERE length(question) > 0 
             AND length(reponse1) > 0 
             AND length(reponse2) > 0 
             AND length(reponse3) > 0 
             AND length(reponse4) > 0 
             ORDER BY RANDOM() LIMIT ?`;
        
        console.log('Exécution de la requête:', query);
        
        db.all(query, [n], (err, rows) => {
            if (err) {
                console.error('Erreur lors de la récupération des questions:', err.message);
                callback({ error: 'Erreur lors de la récupération des questions' });
                return;
            }

            console.log('Questions récupérées:', rows.length);

            // Vérifier l'intégrité des questions récupérées
            const validQuestions = rows.filter(q => 
                q.question && 
                q.reponse1 && 
                q.reponse2 && 
                q.reponse3 && 
                q.reponse4 && 
                q.bonne_reponse >= 1 && 
                q.bonne_reponse <= 4
            );

            console.log('Questions valides:', validQuestions.length);

            if (validQuestions.length < n) {
                console.error('Questions invalides détectées');
                callback({ error: 'Questions invalides détectées' });
                return;
            }

            callback(validQuestions);
        });
    });
}

// Initialiser la base de données
initDatabase();

// Stockage des sessions en mémoire
const sessions = {};
const QUESTION_TIMER = 10; // secondes
const RECONNECTION_TIMEOUT = 60 * 1000; // 1 minute pour se reconnecter

// Constantes pour la gestion des connexions
const CONNECTION_STATES = {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    RECONNECTING: 'reconnecting'
};

const MAX_RECONNECTION_ATTEMPTS = 5;
const RECONNECTION_INTERVAL = 5000; // 5 secondes entre chaque tentative
const MAX_INACTIVE_TIME = 30 * 60 * 1000; // 30 minutes

function calculatePoints(timeElapsed) {
    if (timeElapsed <= 5) {
        return 10; // 10 points si réponse dans les 5 premières secondes
    } else if (timeElapsed <= 10) {
        return 5;  // 5 points si réponse entre 5 et 10 secondes
    } else {
        return 2;  // 2 points si réponse après 10 secondes
    }
}

// Nettoyage des sessions inactives
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of Object.entries(sessions)) {
        // Nettoyer les joueurs déconnectés dont le temps de reconnexion est dépassé
        if (session.isActive) {
            session.players = session.players.filter(player => {
                if (player.disconnected && now > player.reconnectionTime) {
                    delete session.scores[player.pseudo];
                    return false;
                }
                return true;
            });
        }
        
        // Supprimer les sessions vides ou inactives
        if (session.players.length === 0 || (!session.isActive && session.lastActivity && now - session.lastActivity > 30 * 60 * 1000)) {
            clearInterval(session.timer);
            delete sessions[sessionId];
        }
    }
}, 60 * 1000);

// Fonctions de validation
function validateNumberOfQuestions(n) {
    const num = parseInt(n);
    if (isNaN(num) || !Number.isInteger(num)) {
        return 'Le nombre de questions doit être un nombre entier';
    }
    if (num < 5 || num > 20) {
        return 'Le nombre de questions doit être entre 5 et 20';
    }
    return null;
}

function validateSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
        return 'Code de session invalide';
    }
    if (!/^[a-z0-9]{8}$/.test(sessionId)) {
        return 'Format de code de session invalide';
    }
    return null;
}

function validatePseudo(pseudo) {
    if (!pseudo || typeof pseudo !== 'string') {
        return 'Pseudo invalide';
    }
    if (pseudo.length < 2 || pseudo.length > 20) {
        return 'Le pseudo doit contenir entre 2 et 20 caractères';
    }
    if (!/^[a-zA-Z0-9-_]+$/.test(pseudo)) {
        return 'Le pseudo ne peut contenir que des lettres, chiffres, tirets et underscores';
    }
    return null;
}

function validateAnswer(answerIndex) {
    if (typeof answerIndex !== 'number' || !Number.isInteger(answerIndex)) {
        return 'Index de réponse invalide';
    }
    if (answerIndex < 0 || answerIndex > 3) {
        return 'Index de réponse hors limites';
    }
    return null;
}

// Fonction pour gérer la déconnexion d'un joueur
function handlePlayerDisconnection(socket, sessionId, player) {
    const session = sessions[sessionId];
    if (!session) return;

    player.connectionState = CONNECTION_STATES.DISCONNECTED;
    player.disconnectedAt = Date.now();
    player.reconnectionAttempts = 0;

    // Notifier les autres joueurs
    io.to(sessionId).emit('playerDisconnected', {
        pseudo: player.pseudo,
        remainingPlayers: session.players.filter(p => p.connectionState === CONNECTION_STATES.CONNECTED).length,
        message: `${player.pseudo} s'est déconnecté. Tentative de reconnexion...`
    });

    // Mettre la partie en pause si trop de joueurs sont déconnectés
    const connectedPlayers = session.players.filter(p => p.connectionState === CONNECTION_STATES.CONNECTED).length;
    if (connectedPlayers < Math.ceil(session.players.length / 2)) {
        pauseGame(sessionId);
    }
}

// Fonction pour mettre la partie en pause
function pauseGame(sessionId) {
    const session = sessions[sessionId];
    if (!session || !session.isActive) return;

    clearInterval(session.timer);
    session.isPaused = true;
    session.pausedAt = Date.now();
    session.remainingTime = session.timeLeft;

    io.to(sessionId).emit('gamePaused', {
        message: 'La partie est en pause en raison de déconnexions',
        remainingTime: session.remainingTime
    });
}

// Fonction pour reprendre la partie
function resumeGame(sessionId) {
    const session = sessions[sessionId];
    if (!session || !session.isPaused) return;

    session.isPaused = false;
    session.timeLeft = session.remainingTime;
    delete session.pausedAt;
    delete session.remainingTime;

    io.to(sessionId).emit('gameResumed', {
        message: 'La partie reprend',
        timeLeft: session.timeLeft,
        currentQuestion: session.questions[session.currentQuestionIndex],
        questionIndex: session.currentQuestionIndex
    });

    // Redémarrer le timer
    session.timer = setInterval(() => {
        if (session.timeLeft <= 0) {
            clearInterval(session.timer);
            setTimeout(() => nextQuestion(sessionId), 3000);
        } else {
            session.timeLeft--;
            io.to(sessionId).emit('timerUpdate', { timeLeft: session.timeLeft });
        }
    }, 1000);
}

// Modification de la gestion des événements Socket.io
io.on('connection', (socket) => {
    console.log('Un utilisateur s\'est connecté :', socket.id);

    socket.on('createSession', ({ numberOfQuestions = 5 }, callback) => {
        // Valider le nombre de questions
        const error = validateNumberOfQuestions(numberOfQuestions);
        if (error) {
            callback({ error });
            return;
        }

        const sessionId = Math.random().toString(36).substring(2, 10);
        sessions[sessionId] = {
            players: [],
            questions: [],
            scores: {},
            currentQuestionIndex: 0,
            numberOfQuestions: numberOfQuestions,
            answers: new Set(),
            timer: null,
            isActive: false,
            timeLeft: QUESTION_TIMER,
            lastActivity: Date.now()
        };
        callback({ sessionId });
    });

    socket.on('disconnect', () => {
        console.log('Déconnexion du joueur:', socket.id);
        
        for (const [sessionId, session] of Object.entries(sessions)) {
            const player = session.players.find(p => p.id === socket.id);
            
            if (player) {
                handlePlayerDisconnection(socket, sessionId, player);
                break;
            }
        }
    });

    socket.on('rejoinSession', ({ sessionId, pseudo }, callback) => {
        const session = sessions[sessionId];
        if (!session) {
            callback({ success: false, message: 'Session introuvable' });
            return;
        }

        const player = session.players.find(p => p.pseudo === pseudo);
        if (!player) {
            callback({ success: false, message: 'Joueur non trouvé' });
            return;
        }

        // Vérifier si la reconnexion est encore possible
        const reconnectionDeadline = player.disconnectedAt + RECONNECTION_TIMEOUT;
        if (Date.now() > reconnectionDeadline) {
            callback({ success: false, message: 'Délai de reconnexion dépassé' });
            return;
        }

        // Mettre à jour l'état du joueur
        player.id = socket.id;
        player.connectionState = CONNECTION_STATES.CONNECTED;
        delete player.disconnectedAt;
        delete player.reconnectionAttempts;

        socket.join(sessionId);

        // Préparer l'état du jeu pour le joueur qui se reconnecte
        const gameState = {
            currentQuestion: session.questions[session.currentQuestionIndex],
            questionIndex: session.currentQuestionIndex,
            scores: session.scores,
            timeLeft: session.timeLeft,
            totalQuestions: session.questions.length,
            isPaused: session.isPaused
        };

        callback({ success: true, gameState });

        // Notifier les autres joueurs
        io.to(sessionId).emit('playerReconnected', {
            pseudo: player.pseudo,
            players: session.players,
            scores: session.scores
        });

        // Vérifier si on peut reprendre la partie
        const connectedPlayers = session.players.filter(p => p.connectionState === CONNECTION_STATES.CONNECTED).length;
        if (session.isPaused && connectedPlayers >= Math.ceil(session.players.length / 2)) {
            resumeGame(sessionId);
        }
    });

    socket.on('joinSession', ({ sessionId, pseudo }, callback) => {
        // Valider le code de session et le pseudo
        const sessionError = validateSessionId(sessionId);
        if (sessionError) {
            callback({ success: false, message: sessionError });
            return;
        }

        const pseudoError = validatePseudo(pseudo);
        if (pseudoError) {
            callback({ success: false, message: pseudoError });
            return;
        }

        const session = sessions[sessionId];
        if (!session) {
            callback({ success: false, message: 'Session introuvable' });
            return;
        }

        if (session.isActive) {
            callback({ success: false, message: 'La partie a déjà commencé' });
            return;
        }

        if (session.players.some(p => p.pseudo === pseudo)) {
            callback({ success: false, message: 'Ce pseudo est déjà utilisé' });
            return;
        }

        // Ajouter l'état de connexion initial
        session.players.push({ 
            id: socket.id, 
            pseudo,
            connectionState: CONNECTION_STATES.CONNECTED 
        });
        session.scores[pseudo] = 0;
        socket.join(sessionId);
        session.lastActivity = Date.now();
        
        io.to(sessionId).emit('playerJoined', { 
            players: session.players,
            scores: session.scores 
        });
        
        callback({ success: true });
    });

    socket.on('startGame', ({ sessionId }, callback) => {
        console.log('Tentative de démarrage de partie:', sessionId);
        
        const session = sessions[sessionId];
        if (!session) {
            console.error('Session introuvable:', sessionId);
            callback({ success: false, message: 'Session introuvable' });
            return;
        }

        if (session.players.length < 1) {
            console.error('Pas assez de joueurs pour démarrer');
            callback({ success: false, message: 'Il faut au moins 1 joueur pour démarrer la partie' });
            return;
        }

        if (session.isActive) {
            console.error('La partie est déjà en cours');
            callback({ success: false, message: 'La partie est déjà en cours' });
            return;
        }

        console.log('Récupération des questions...');
        getRandomQuestions(session.numberOfQuestions, (result) => {
            if (result.error) {
                console.error('Erreur lors de la récupération des questions:', result.error);
                callback({ success: false, message: result.error });
                return;
            }

            console.log(`${result.length} questions récupérées`);
            session.questions = result;
            session.currentQuestionIndex = 0;
            session.isActive = true;
            session.answers.clear();
            session.timeLeft = QUESTION_TIMER;

            callback({ success: true });

            // Envoyer un événement pour indiquer que la partie commence
            io.to(sessionId).emit('gameStarting', {
                message: 'La partie commence !',
                numberOfQuestions: session.numberOfQuestions
            });

            // Envoyer la première question immédiatement
            sendNextQuestion(sessionId);
        });
    });

    socket.on('submitAnswer', ({ sessionId, questionIndex, answerIndex, pseudo }, callback) => {
        // Valider toutes les entrées
        const sessionError = validateSessionId(sessionId);
        if (sessionError) {
            callback({ success: false, message: sessionError });
            return;
        }

        const pseudoError = validatePseudo(pseudo);
        if (pseudoError) {
            callback({ success: false, message: pseudoError });
            return;
        }

        const answerError = validateAnswer(answerIndex);
        if (answerError) {
            callback({ success: false, message: answerError });
            return;
        }

        const session = sessions[sessionId];
        if (!session) {
            callback({ success: false, message: 'Session introuvable' });
            return;
        }

        if (!session.isActive) {
            callback({ success: false, message: 'La partie n\'a pas encore commencé' });
            return;
        }

        if (session.currentQuestionIndex !== questionIndex) {
            callback({ success: false, message: 'Question invalide' });
            return;
        }

        if (!session.players.some(p => p.pseudo === pseudo)) {
            callback({ success: false, message: 'Joueur non trouvé dans la session' });
            return;
        }

        if (session.answers.has(pseudo)) {
            callback({ success: false, message: 'Vous avez déjà répondu à cette question' });
            return;
        }

        if (session.timeLeft <= 0) {
            callback({ success: false, message: 'Le temps est écoulé' });
            return;
        }

        const question = session.questions[questionIndex];
        const timeElapsed = QUESTION_TIMER - session.timeLeft;
        const isCorrect = question.bonne_reponse === (answerIndex + 1);
        
        const points = isCorrect ? calculatePoints(timeElapsed) : 0;
        session.scores[pseudo] += points;
        
        session.answers.add(pseudo);
        
        callback({ 
            success: true, 
            isCorrect, 
            points,
            correctAnswer: question.bonne_reponse - 1,
            correctAnswerText: question[`reponse${question.bonne_reponse}`]
        });

        io.to(sessionId).emit('scoreUpdate', { scores: session.scores });

        if (session.answers.size === session.players.length) {
            clearInterval(session.timer);
            setTimeout(() => nextQuestion(sessionId), 3000);
        }
    });
});

// Modification de la fonction sendNextQuestion pour gérer la pause
function sendNextQuestion(sessionId) {
    const session = sessions[sessionId];
    if (!session) {
        console.error('Session non trouvée:', sessionId);
        return;
    }

    console.log('Envoi de la question suivante pour la session:', sessionId);
    console.log('Index de la question:', session.currentQuestionIndex);
    console.log('Nombre total de questions:', session.questions.length);

    if (session.currentQuestionIndex >= session.questions.length) {
        console.log('Fin de la partie - Plus de questions');
        endGame(sessionId);
        return;
    }

    // Vérifier si la partie peut continuer - Suppression de la vérification des joueurs connectés
    // car nous avons déjà vérifié au démarrage de la partie

    // Réinitialiser le timer et les réponses
    clearInterval(session.timer);
    session.timeLeft = QUESTION_TIMER;
    session.answers.clear();
    
    const question = session.questions[session.currentQuestionIndex];
    console.log('Envoi de la question:', question.question);

    io.to(sessionId).emit('newQuestion', {
        question,
        questionIndex: session.currentQuestionIndex,
        totalQuestions: session.questions.length
    });

    // Démarrer le timer seulement si la partie n'est pas en pause
    if (!session.isPaused) {
        session.timer = setInterval(() => {
            if (session.timeLeft <= 0) {
                clearInterval(session.timer);
                setTimeout(() => nextQuestion(sessionId), 3000);
            } else {
                session.timeLeft--;
                io.to(sessionId).emit('timerUpdate', { timeLeft: session.timeLeft });
            }
        }, 1000);
    }
}

function nextQuestion(sessionId) {
    const session = sessions[sessionId];
    if (!session) return;

    clearInterval(session.timer); // S'assurer que l'ancien timer est arrêté
    session.currentQuestionIndex++;
    sendNextQuestion(sessionId);
}

function endGame(sessionId) {
    const session = sessions[sessionId];
    if (!session) return;

    // Nettoyer les timers et l'état de la session
    clearInterval(session.timer);
    session.isActive = false;
    session.timer = null;
    
    // Envoyer les résultats finaux
    io.to(sessionId).emit('gameEnded', { 
        scores: session.scores,
        players: session.players
    });

    // Supprimer la session après un délai
    setTimeout(() => {
        delete sessions[sessionId];
    }, 5000);
}

// Démarrage du serveur
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
