const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { updateClubsPanel } = require('../modules/clubsPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-panels')
    .setDescription('Réinitialise les panels clubs (staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Récupère les anciens messages depuis Supabase
      const { data: savedMessages } = await supabase
        .from('panel_messages')
        .select('*');

      // 2. Supprime les anciens messages Discord
      if (savedMessages?.length > 0) {
        const channel = await interaction.client.channels.fetch(process.env.CLUBS_CHANNEL_ID);
        for (const row of savedMessages) {
          try {
            const msg = await channel.messages.fetch(row.message_id);
            await msg.delete();
          } catch {
            // Message déjà supprimé, on ignore
          }
        }
      }

      // 3. Vide la table Supabase
      await supabase
        .from('panel_messages')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      await interaction.editReply({ content: '🗑️ Anciens panels supprimés — recréation en cours...' });

      // 4. Recrée les panels
      await updateClubsPanel(interaction.client);

      await interaction.editReply({ content: '✅ Panels réinitialisés et recréés !' });

    } catch (err) {
      console.error('[ResetPanels]', err);
      await interaction.editReply({ content: '❌ Erreur lors de la réinitialisation.' });
    }
  }
};