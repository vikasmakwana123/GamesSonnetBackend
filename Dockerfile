# 1️⃣ Base Image
FROM node:18

# 2️⃣ Install Python
RUN apt-get update && apt-get install -y python3 python3-pip

# 3️⃣ Set working directory
WORKDIR /app

# 4️⃣ Copy Node dependencies
COPY package*.json ./

# 5️⃣ Install Node packages
RUN npm install

# 6️⃣ Copy Python dependencies
COPY requirements.txt .

# 7️⃣ Install Python packages
RUN pip3 install -r requirements.txt

# 8️⃣ Copy all project files
COPY . .

# 9️⃣ Expose backend port
EXPOSE 5000

# 🔟 Start backend
CMD ["npm", "start"]
