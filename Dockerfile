FROM node:18

# Install Python + system libs needed for numpy/scipy
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-dev \
    build-essential gfortran libatlas-base-dev

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Install Python dependencies (fix PEP 668)
COPY requirements.txt ./
RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt

# Copy the rest of the backend files
COPY . .

# Expose backend port
EXPOSE 5000

# Start the Node backend
CMD ["npm", "start"]
