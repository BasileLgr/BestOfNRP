const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
    console.error("Le token Discord est introuvable. Vérifiez le fichier .env.");
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

let ACCESS_TOKEN = '';

// Fonction pour récupérer un token Twitch
const getTwitchAccessToken = async () => {
    try {
        const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: process.env.TWITCH_CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials',
            },
        });
        ACCESS_TOKEN = response.data.access_token;
        console.log('Token Twitch récupéré avec succès.');
    } catch (error) {
        console.error('Erreur lors de la récupération du token Twitch:', error.message);
    }
};

// Calculer la date de début en fonction de la durée
const calculateStartDate = (duration) => {
    const now = new Date();
    if (duration === '24h') now.setDate(now.getDate() - 1);
    else if (duration === '7j') now.setDate(now.getDate() - 7);
    else if (duration === '30j') now.setDate(now.getDate() - 30);
    else return null;
    return now.toISOString();
};

const getTwitchClips = async (username, duration = '7j', gameName = '', limit = 5) => {
    try {
        if (!ACCESS_TOKEN) await getTwitchAccessToken();

        // Calculer la date de début
        const startDate = calculateStartDate(duration);

        // Récupérer l'ID du diffuseur
        const userResponse = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
            params: { login: username },
        });

        const broadcasterId = userResponse.data.data[0]?.id;
        if (!broadcasterId) return `Utilisateur Twitch "${username}" introuvable.`;

        // Récupérer les clips
        const clipsResponse = await axios.get('https://api.twitch.tv/helix/clips', {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
            params: {
                broadcaster_id: broadcasterId,
                first: 50, // Récupérer un plus grand nombre pour filtrer
                started_at: startDate,
            },
        });

        let clips = clipsResponse.data.data;

        // Filtrer par catégorie si spécifiée
        if (gameName) {
            const gameResponse = await axios.get('https://api.twitch.tv/helix/games', {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
                params: { name: gameName },
            });

            const gameId = gameResponse.data.data[0]?.id;
            if (!gameId) return `Catégorie "${gameName}" introuvable.`;

            clips = clips.filter((clip) => clip.game_id === gameId);
        }

        if (!clips.length) return `Aucun clip trouvé pour "${username}" dans la catégorie "${gameName}".`;

        // Trier les clips par nombre de vues (décroissant) et limiter les résultats
        clips.sort((a, b) => b.view_count - a.view_count);
        clips = clips.slice(0, limit);

        // Retourner les clips formatés avec le nombre de vues
        return clips
            .map((clip) => `${clip.title} - ${clip.url} (${clip.view_count} vues)`)
            .join('\n');
    } catch (error) {
        console.error('Erreur lors de la récupération des clips:', error.message);
        return 'Erreur lors de la récupération des clips.';
    }
};



// Quand le bot est prêt
client.once('ready', () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Diviser la commande en arguments
    const args = message.content.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(arg => arg.replace(/"/g, ''));
    const command = args?.[0];
    const username = args?.[1];
    const duration = args?.[2] || '7j';
    const gameName = args?.[3] || '';
    let limit = parseInt(args?.[4], 10) || 5;

    // Limiter le nombre de vidéos à 15 maximum
    if (limit > 15) {
        limit = 15;
        message.reply('Le nombre de clips est limité à 15 maximum. La limite a été ajustée automatiquement.');
    }

    if (command === '!clips') {
        if (!username) {
            message.reply('Veuillez fournir un nom d\'utilisateur Twitch. Exemple : `!clips username`');
            return;
        }

        const clips = await getTwitchClips(username, duration, gameName, limit);
        message.reply(clips);
    }
});



// Connexion au bot
client.login(DISCORD_TOKEN);
