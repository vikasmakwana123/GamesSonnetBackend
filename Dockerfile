FROM node:18

# Install Python + system libs needed for numpy/scipy
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-dev \
    build-essential gfortran libatlas-base-dev

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
