# Use an official Node.js runtime as a parent image
FROM node:14-alpine

# Set the working directory to /app
WORKDIR /app

# Copy the package.json and package-lock.json files to the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files to the container
COPY . .

# Set the environment variable for the React app
ENV REACT_APP_ENVIRONMENT=development

# Expose the port that the React app will run on
EXPOSE 3000

# Start the React app
CMD ["npm", "start"]