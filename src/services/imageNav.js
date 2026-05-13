'use strict';
const { StringSelectMenuBuilder, ActionRowBuilder, AttachmentBuilder } = require('discord.js');
const { getBattleLog } = require('../lib/brawlapi');
const { generateRankCard }     = require('../modules/rankCard');
const { renderTrophiesCard }   = require('../modules/trophiesCard');
const { renderBattlesCard }    = require('../modules/battlesCard');
const { generateWinstreakCard } = require('../modules/winstreakCard');
const { renderProfileCard }    = require('../modules/profileCardExact');

const TIMEOUT_MS = 5 * 60 * 1000; // 5 min

const MODES = [
  { value: 'carte_profil',     label: 'Carte profil',      description: 'Carte de profil visuelle',         emoji: '🃏' },
  { value: 'prestige',         label: 'Prestige',          description: 'Carte prestige et statistiques',   emoji: '⭐' },
  { value: 'trophies',         label: 'Trophées actuels',  description: 'Trophées actuels par brawler',     emoji: '🏆' },
  { value: 'highest_trophies', label: 'Trophées record',   description: 'Record de trophées par brawler',   emoji: '🥇' },
  { value: 'battles',          label: 'Dernières parties', description: '25 dernières parties jouées',      emoji: '⚔️' },
  { value: 'ws_max',           label: 'WS Maximum',        description: 'Meilleure série par brawler',      emoji: '🔥' },
  { value: 'ws_current',       label: 'WS Actuelle',       description: 'Série de victoires en cours',      emoji: '💥' },
];

function buildRow(current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('image_nav')
      .setPlaceholder('Changer de vue...')
      .addOptions(MODES.map(m => ({
        label:       m.label,
        description: m.description,
        value:       m.value,
        emoji:       m.emoji,
        default:     m.value === current,
      })))
  );
}

async function renderMode(mode, bsTag, player, extra) {
  switch (mode) {
    case 'carte_profil': {
      const rntData = extra._rntData;
      if (!rntData || !rntData.stats) throw new Error('🔧 Carte profil indisponible pour le moment, réessaie dans quelques instants.');
      return {
        buffer: await renderProfileCard({
          player: rntData,
          extra: { expLevel: extra._expLevel || 1, expPoints: extra._expPoints || 0, clubName: extra._clubName || '' },
          playerTag: bsTag,
        }),
        name: 'carte-profil.png',
      };
    }

    case 'prestige':
      return { buffer: await generateRankCard(player, extra), name: 'prestige.png' };

    case 'trophies':
      return { buffer: await renderTrophiesCard(bsTag, player, extra, 'current'), name: 'trophies.png' };

    case 'highest_trophies':
      return { buffer: await renderTrophiesCard(bsTag, player, extra, 'highest'), name: 'trophies-record.png' };

    case 'battles': {
      const items = extra._cachedBattles ?? (await getBattleLog(bsTag)).items ?? [];
      return { buffer: await renderBattlesCard(bsTag, player, extra, items), name: 'battles.png' };
    }

    case 'ws_max':
      return { buffer: await generateWinstreakCard(player, extra, 'max'), name: 'ws-max.png' };

    case 'ws_current':
      return { buffer: await generateWinstreakCard(player, extra, 'current'), name: 'ws-current.png' };

    default:
      return { buffer: await generateRankCard(player, extra), name: 'prestige.png' };
  }
}

async function setupImageNav(interaction, bsTag, player, extra, initialMode) {
  const { buffer, name } = await renderMode(initialMode, bsTag, player, extra);

  const msg = await interaction.editReply({
    files:      [new AttachmentBuilder(buffer, { name })],
    components: [buildRow(initialMode)],
  });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.customId === 'image_nav',
    time:   TIMEOUT_MS,
  });

  collector.on('collect', async i => {
    // Seul l'invocateur peut utiliser le menu
    if (i.user.id !== interaction.user.id) {
      return i.reply({
        content:   '❌ Ce menu est réservé à la personne qui a lancé la commande. Fais la commande toi-même !',
        ephemeral: true,
      });
    }

    await i.deferUpdate();
    try {
      const mode = i.values[0];
      const { buffer: buf, name: n } = await renderMode(mode, bsTag, player, extra);
      await i.editReply({
        files:      [new AttachmentBuilder(buf, { name: n })],
        components: [buildRow(mode)],
      });
    } catch (err) {
      console.error('[ImageNav]', err);
      await i.editReply({ content: `❌ ${err.message}`, files: [], components: [] }).catch(() => {});
    }
  });

  // Supprime le menu après expiration
  collector.on('end', () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}

module.exports = { setupImageNav };
