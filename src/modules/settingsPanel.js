const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

function getAccountDisplayName(account) {
  return account.bs_name || account.bs_tag || 'Compte inconnu';
}

function formatAccountLine(account) {
  const crown = account.is_main ? '👑 ' : '';
  const name = getAccountDisplayName(account);
  return `${crown}**${name}** — \`${account.bs_tag}\``;
}

function getAccountDisplayName(account) {
  return account.bs_name || account.bs_tag || 'Compte inconnu';
}

function buildSettingsEmbed(accounts = [], mainAccount = null) {
  const description = mainAccount
    ? `Voici tes profils Brawl Stars liés. Ton compte principal actuel est **${getAccountDisplayName(mainAccount)}**.`
    : `Tu n’as encore aucun compte Brawl Stars lié. Ajoute ton premier compte pour commencer.`;

  const accountsText = accounts.length
    ? accounts.map(formatAccountLine).join('\n')
    : 'Aucun compte lié pour le moment.';

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('⚙️ Profile Settings')
    .setDescription(description)
    .addFields(
      {
        name: '👑 Main Profile',
        value: mainAccount
          ? `**${mainAccount.bs_name || 'Compte inconnu'}**\n\`${mainAccount.bs_tag}\``
          : 'Aucun compte principal défini.',
        inline: true,
      },
      {
        name: '📚 Profiles saved',
        value: `${accounts.length}/5`,
        inline: true,
      },
      {
        name: '\u200B',
        value: '\u200B',
        inline: true,
      },
      {
        name: '🎮 Linked Accounts',
        value: accountsText,
        inline: false,
      },
      {
        name: 'ℹ️ Help',
        value: 'Utilise les boutons ci-dessous pour ajouter un compte, choisir ton compte principal ou supprimer un profil.',
        inline: false,
      },
    );

  return embed;
}

function buildAccountsSelect(accounts = []) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('settings:view_account')
    .setPlaceholder(accounts.length ? 'Select an account' : 'No linked account')
    .setDisabled(accounts.length === 0);

  if (accounts.length) {
    select.addOptions(
      accounts.map(account => ({
        label: `${account.is_main ? '👑 ' : ''}${getAccountDisplayName(account)}`.slice(0, 100),
        description: account.bs_tag,
        value: account.bs_tag,
      }))
    );
  }

  return new ActionRowBuilder().addComponents(select);
}

function buildSettingsButtons(accounts = []) {
  const hasAccounts = accounts.length > 0;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('settings:add')
      .setLabel('Add')
      .setStyle(ButtonStyle.Success)
      .setDisabled(accounts.length >= 5),
    new ButtonBuilder()
      .setCustomId('settings:set_main')
      .setLabel('Set Main')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasAccounts || accounts.length < 2),
    new ButtonBuilder()
      .setCustomId('settings:delete')
      .setLabel('Delete')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasAccounts),
  );
}

function buildSettingsPanel(accounts = [], mainAccount = null) {
  return {
    embeds: [buildSettingsEmbed(accounts, mainAccount)],
    components: [
      buildSettingsButtons(accounts),
    ],
  };
}

function buildSetMainSelect(accounts = []) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('settings:set_main_select')
    .setPlaceholder('Choisis le compte principal')
    .setDisabled(accounts.length < 2);

  if (accounts.length >= 2) {
    select.addOptions(
      accounts.map(account => ({
        label: `${account.is_main ? '👑 ' : ''}${getAccountDisplayName(account)}`.slice(0, 100),
        description: account.bs_tag,
        value: account.bs_tag,
      }))
    );
  }

  return new ActionRowBuilder().addComponents(select);
}

function buildDeleteSelect(accounts = []) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('settings:delete_select')
    .setPlaceholder('Choisis le compte à supprimer')
    .setDisabled(accounts.length === 0);

  if (accounts.length) {
    select.addOptions(
      accounts.map(account => ({
        label: `${account.is_main ? '👑 ' : ''}${getAccountDisplayName(account)}`.slice(0, 100),
        description: account.bs_tag,
        value: account.bs_tag,
      }))
    );
  }

  return new ActionRowBuilder().addComponents(select);
}

module.exports = {
  buildSettingsEmbed,
  buildAccountsSelect,
  buildSettingsButtons,
  buildSettingsPanel,
  buildSetMainSelect,
  buildDeleteSelect,
};