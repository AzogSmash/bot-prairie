const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');

const {
  getLinkedAccounts,
  getMainAccount,
  addLinkedAccount,
  setMainAccount,
  removeLinkedAccount,
  isBsTagAlreadyLinked,
} = require('../lib/brawlAccounts');
const { getPlayer } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');
const { buildSettingsPanel, buildSetMainSelect, buildDeleteSelect } = require('./settingsPanel');
const { updateMemberRoles } = require('../jobs/snapshots');
const { getAccountsSummary } = require('../lib/brawlAccounts');

async function refreshSettingsMessage(interaction, discordId) {
  const accounts = await getLinkedAccounts(discordId);
  const mainAccount = await getMainAccount(discordId);
  const panel = buildSettingsPanel(accounts, mainAccount);

  const payload = {
    content: '',
    ...panel,
  };

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await interaction.update(payload);
  } else {
    await interaction.editReply(payload);
  }
}

async function rebuildMemberSummaryAndRoles(member) {
  const accounts = await getLinkedAccounts(member.id);
  const summaryMap = new Map();

  for (const acc of accounts) {
    const accPlayer = await getPlayer(acc.bs_tag);
    summaryMap.set(acc.bs_tag, {
      trophies: accPlayer.trophies,
      clubName: accPlayer.club?.name || null,
      bsName: accPlayer.name,
    });
  }

  const summary = await getAccountsSummary(member.id, summaryMap);

  await supabase
    .from('members')
    .update({
      brawlstars_tag: summary.mainTag,
      brawlstars_trophies: summary.bestTrophies,
      club_name: summary.mainAccount?.clubName || null,
    })
    .eq('discord_id', member.id);

  await updateMemberRoles(member, summary.clubNames, summary.bestTrophies);

  return summary;
}

async function handleSettingsButton(interaction) {
  const discordId = interaction.user.id;
  const accounts = await getLinkedAccounts(discordId);

  if (interaction.customId === 'settings:add') {
    const modal = new ModalBuilder()
      .setCustomId('settings:add_modal')
      .setTitle('Ajouter un compte Brawl Stars');

    const tagInput = new TextInputBuilder()
      .setCustomId('tag')
      .setLabel('Tag Brawl Stars')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('#P80YQJRL')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(tagInput));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'settings:set_main') {
    return interaction.update({
      content: 'Choisis le compte à définir comme principal :',
      embeds: [],
      components: [buildSetMainSelect(accounts)],
    });
  }

  if (interaction.customId === 'settings:delete') {
    return interaction.update({
      content: 'Choisis le compte à supprimer :',
      embeds: [],
      components: [buildDeleteSelect(accounts)],
    });
  }
}

async function handleSettingsModal(interaction) {
  if (interaction.customId !== 'settings:add_modal') return false;

  const discordId = interaction.user.id;
  const member = interaction.member;
  const rawTag = interaction.fields.getTextInputValue('tag');

  const player = await getPlayer(rawTag);

  const alreadyLinkedElsewhere = await isBsTagAlreadyLinked(player.tag, discordId);
  if (alreadyLinkedElsewhere) {
    return interaction.reply({
      content: '❌ Ce compte Brawl Stars est déjà lié à un autre membre du serveur.',
      ephemeral: true,
    });
  }

  const existingAccounts = await getLinkedAccounts(discordId);

  if (existingAccounts.some(acc => acc.bs_tag === player.tag)) {
    return interaction.reply({
      content: 'ℹ️ Ce compte est déjà lié à ton profil.',
      ephemeral: true,
    });
  }

  if (existingAccounts.length >= 5) {
    return interaction.reply({
      content: '❌ Tu as déjà atteint la limite de 5 comptes liés.',
      ephemeral: true,
    });
  }

  await addLinkedAccount(discordId, player.tag, player.name, existingAccounts.length === 0);
  await rebuildMemberSummaryAndRoles(member);

  const accounts = await getLinkedAccounts(discordId);
  const mainAccount = await getMainAccount(discordId);

  return interaction.reply({
    content: '✅ Compte ajouté avec succès.',
    ...buildSettingsPanel(accounts, mainAccount),
    ephemeral: true,
  });
}

async function handleSettingsSelect(interaction) {
  const discordId = interaction.user.id;
  const member = interaction.member;
  const selectedTag = interaction.values[0];

  if (interaction.customId === 'settings:set_main_select') {
    await setMainAccount(discordId, selectedTag);
    await rebuildMemberSummaryAndRoles(member);
    return refreshSettingsMessage(interaction, discordId);
  }

  if (interaction.customId === 'settings:delete_select') {
    await removeLinkedAccount(discordId, selectedTag);
    await rebuildMemberSummaryAndRoles(member);
    return refreshSettingsMessage(interaction, discordId);
  }

  return false;
}

module.exports = {
  handleSettingsButton,
  handleSettingsModal,
  handleSettingsSelect,
};