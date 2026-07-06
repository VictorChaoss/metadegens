# Metadegens: Casino AI Agent System

An autonomous AI-powered casino gaming system where multiple LLM agents play casino games and make strategic decisions using OpenRouter API.

## Features

- Multiple AI agents playing casino games autonomously
- Real-time decision making using LLM models
- Comprehensive logging of wins, losses, and statistics
- Modular architecture with clean separation of concerns
- Support for multiple casino games (Blackjack, Roulette, Slots)
- Detailed performance analytics and AI-generated session analysis

## Architecture

```
src/
├── config/
│   └── config.js          # Configuration management
├── models/
│   └── Agent.js           # AI agent model
├── services/
│   ├── casinoApi.js       # Casino Automation API client
│   ├── llmService.js      # OpenRouter LLM integration
│   └── gameCoordinator.js # Game loop orchestration
├── utils/
│   └── logger.js          # Winston logging utility
└── index.js               # Main entry point
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your OpenRouter API key:
```
OPENROUTER_API_KEY=your_api_key_here
```

3. Ensure the casino automation API is running on `http://localhost:7777`

> Note: We use puppeteer for automating playing on metawin, thus we keep automation api closed source to avoid bot detection and ban by metawin.

## Configuration

You can customize the following parameters in `.env`:

- `OPENROUTER_API_KEY`: Your OpenRouter API key (required)
- `CASINO_API_URL`: Metawin Automation API endpoint (default: http://localhost:7777)
- `INITIAL_BALANCE`: Starting balance for each agent (default: 1000)
- `MAX_ROUNDS`: Maximum number of game rounds (default: 0 for infinite, set to a number to limit rounds)
- `AGENTS_COUNT`: Number of AI agents to run (default: 3)

## Usage

Start the system:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## How It Works

1. **Initialization**: Each agent is created with an initial balance and registered with the automation API that manages browsers for AIs
2. **Game Loop**: Agents take turns making decisions in an infinite loop:
   - Request current balance from the automation API
   - Analyze game history and available options
   - Use LLM to make strategic decisions (which game, bet amount)
   - Place bets through the automation API
   - Track results and update statistics
3. **Completion**: The system runs infinitely until all agents decide to stop or run out of funds. Intermediate statistics are shown every 10 rounds, and comprehensive final statistics are displayed when the loop ends

## Logging

Logs are stored in the `logs/` directory:
- `combined.log`: All log messages
- `error.log`: Error messages only
- Console output for real-time monitoring

## Statistics

The system tracks and displays:
- Individual agent performance (balance, profit/loss, ROI, win rate)
- Game-by-game history
- Aggregate statistics across all agents
- AI-generated analysis of each agent's session

## API Endpoints Used

The system interacts with the following automation API endpoints:
- `POST /account/create`: Create player account
- `GET /account/{playerId}/balance`: Get current balance
- `GET /games`: List available games
- `POST /game/play`: Place a bet
- `GET /account/{playerId}/history`: Get game history
- `GET /account/{playerId}/stats`: Get player statistics

## License

MIT
