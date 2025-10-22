# Petrinaut Dev Mode

This folder contains a development environment for the Petrinaut library.

## Setup

1. Install dependencies (from the root package directory):

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

## Features

- **Local Storage Persistence**: Created Petri nets are automatically saved to browser local storage
- **MUI Theme Integration**: Properly wrapped with the required MUI theme and emotion cache
- **Immer Integration**: Uses `produce` from Immer for the `mutatePetriNetDefinition` function
- **Multiple Nets**: Create and manage multiple Petri nets with automatic switching
- **Hot Reload**: Development server with hot module replacement

## Usage

The dev mode provides a fully functional Petrinaut editor that demonstrates how to properly integrate the component with:

- MUI theming
- Local storage persistence
- Immer for state mutations
- React state management

This serves as both a development tool and a reference implementation for integrating Petrinaut into other applications.
