# HealthyMeal

AI-powered culinary recipe personalization app that adapts recipes to individual dietary preferences.

## Project Description

HealthyMeal is an application that uses LLMs to personalize culinary recipes based on users' individual dietary preferences. The app addresses the common challenge of adapting online recipes to personal dietary needs and restrictions.

### Key Features

- User account management
- Dietary preference profile customization
- Recipe management (save, view, edit, delete)
- AI-powered recipe generation based on preferences
- AI-powered modification of existing recipes

### Problem Solved

HealthyMeal solves several challenges users face when looking for suitable recipes:

- Time-consuming manual recipe modifications
- Lack of knowledge on ingredient substitutions
- Difficulty finding recipes matching specific dietary preferences
- Having to search multiple sources for appropriate recipes

## Tech Stack

### Frontend

- Astro 5 - Fast, efficient pages with minimal JavaScript
- React 19 - For interactive components
- TypeScript 5 - For static typing and better IDE support
- Tailwind 4 - For convenient styling
- Shadcn/ui - Accessible React component library

### Backend

- Supabase - Comprehensive backend solution
  - PostgreSQL database
  - Built-in user authentication
  - SDK as Backend-as-a-Service

### AI Integration

- Openrouter.ai - Access to various AI models (OpenAI, Anthropic, Google, etc.)

### Testing

- Jest - JavaScript testing framework for unit and integration tests
- React Testing Library - Simple and complete testing utilities for React components
- Playwright - End-to-end testing framework for web applications
- Supertest - HTTP testing library for API endpoints

### CI/CD & Hosting

- GitHub Actions - For CI/CD pipelines
- Vercel - For application hosting

## Getting Started Locally

### Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/Rasp228/10x-HealthyFood.git
cd 10x-HealthyFood
```

2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

### Environment Setup

Create a `.env` file in the root directory with the following variables:

```
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# OpenRouter AI Configuration
OPENROUTER_API_KEY=your_openrouter_key
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run astro` - Run Astro CLI commands
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier

## Project Scope

### MVP Includes

- User account management (registration, login, logout)
- User profile with dietary preferences
- Recipe management (add, view, edit, delete text-based recipes)
- AI integration for recipe generation and modification

## Project Status

The project is currently in MVP development phase.

## License

MIT
