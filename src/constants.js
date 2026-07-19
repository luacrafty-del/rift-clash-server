// Shared game constants. Keep in sync with the client's copy.
module.exports = {
  TEAM_SIZE: 5,               // 5v5
  MATCH_SIZE: 10,             // total players per match
  QUEUE_BOT_FILL_MS: 12000,   // if queue hasn't filled after this long, fill remainder with bots
  BAN_PHASE_MS: 20000,        // total ban phase duration
  BAN_SLOTS: 6,               // 3 bans per team
  PICK_PHASE_MS: 25000,       // total pick phase duration
  PICK_TURN_MS: 12000,        // max time per individual pick before auto-pick
  LOADING_MS: 6000,           // loading screen duration once picks lock
  TICK_RATE: 20,              // server simulation ticks per second
  HEROES: [
    'Ronin', 'Seren', 'Vexa', 'Kael', 'Nyx',
    'Brix', 'Tala', 'Doran', 'Ashka', 'Miri'
  ]
};
