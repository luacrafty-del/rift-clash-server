# ⚔️ Rift Clash Legends

A 2.5D MOBA (Multiplayer Online Battle Arena) game built with **HTML5**, **Three.js**, and **JavaScript**. 

## 🎮 Features

- **2.5D Isometric View**: Enjoy a tactical top-down perspective with 3D graphics
- **Hero Character**: Play as a powerful mage with unique abilities
- **Real-time Combat**: Fight against enemy minions and champions
- **Ability System**: Cast powerful spells with mana management
- **Experience & Leveling**: Defeat enemies to gain levels and grow stronger
- **Gold System**: Earn gold from kills to progress
- **Enemy Waves**: Progressive difficulty with enemy waves spawning every 20 seconds
- **Dynamic UI**: Real-time stats, ability cooldowns, and minimap
- **Responsive Controls**: Smooth keyboard and mouse controls

## 🎮 Controls

| Key | Action |
|-----|--------|
| **W** | Move Up |
| **A** | Move Left |
| **S** | Move Down |
| **D** | Move Right |
| **SPACE** | Basic Attack |
| **Q** | Ability 1 (Fireball) |
| **E** | Ability 2 (Ice Storm) |
| **R** | Ultimate (Meteor) |
| **MOUSE** | Look Around (hold right-click) |

## 🚀 Getting Started

### Requirements
- Modern web browser (Chrome, Firefox, Edge, Safari)
- No external dependencies required (Three.js is loaded via CDN)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/luacrafty-del/rift-clash-server.git
```

2. Navigate to the project directory:
```bash
cd rift-clash-server
```

3. Open `index.html` in your web browser:
```bash
# Using Python (if available)
python -m http.server 8000
# Then visit http://localhost:8000

# Or just double-click index.html
```

## 🎯 Game Mechanics

### Combat System
- **Basic Attack**: Costs 5 mana, deals damage to the nearest enemy within range
- **Abilities**: Each ability has mana cost and cooldown
  - **Fireball (Q)**: 20 mana, 3s cooldown
  - **Ice Storm (E)**: 25 mana, 4s cooldown
  - **Meteor (R)**: 50 mana, 8s cooldown (Ultimate)

### Progression
- **Experience**: Gain XP from defeating enemies
- **Leveling**: Level up to increase health, mana, and attack power
- **Gold**: Earn gold from kills to purchase items (future feature)

### Enemy Types
- **Minions**: Weak enemies, worth 25 XP and 15 gold
- **Champions**: Stronger enemies, worth 75 XP and 50 gold

## 📊 UI Elements

- **Health Bar**: Current health status
- **Mana Bar**: Spell casting resource
- **Experience Bar**: Progress to next level
- **Stats Display**: Level, gold, kills
- **Ability Panel**: Shows cooldowns for each ability
- **Minimap**: Real-time tactical overview
- **Wave Information**: Current enemy count and game time

## 🎨 Graphics

- **3D Rendering**: Using Three.js for high-quality 3D graphics
- **Shadow Mapping**: Dynamic shadows for realistic lighting
- **Particle Effects**: Visual feedback for combat (via projectiles)
- **Glowing Elements**: UI elements with sci-fi aesthetic

## 🔧 Technical Stack

- **Three.js r128**: 3D graphics library
- **Vanilla JavaScript**: No frameworks, pure JS for game logic
- **WebGL**: Hardware-accelerated rendering
- **Canvas API**: UI rendering and minimap

## 🎮 Gameplay Tips

1. **Manage Mana**: Don't spam abilities; use basic attacks to conserve mana
2. **Kite Enemies**: Move while attacking to avoid taking damage
3. **Focus Fire**: Target one enemy at a time for efficiency
4. **Level Up**: Defeat enemies quickly to reach higher levels
5. **Use Abilities Wisely**: Save your ultimate for multiple enemies

## 🚀 Future Features

- [ ] Multiple playable heroes with unique abilities
- [ ] Item shop and inventory system
- [ ] Multiplayer mode
- [ ] Tower defense elements
- [ ] Boss fights
- [ ] Ranked progression system
- [ ] Sound effects and background music
- [ ] Skill trees and talent system
- [ ] Different map layouts
- [ ] Seasonal content and rewards

## 🐛 Known Issues

- Enemy pathfinding is basic (straight-line approach)
- No collision detection between players/enemies
- Performance may vary on lower-end systems with many enemies

## 📝 License

This project is open source and available under the MIT License.

## 👨‍💻 Contributing

Feel free to fork this repository and submit pull requests for any improvements!

## 🎉 Credits

- Built with **Three.js** (https://threejs.org/)
- Game design inspired by popular MOBAs
- Created with ❤️ by the Rift Clash Legends team

---

**Start your adventure in the Rift today! ⚔️**
