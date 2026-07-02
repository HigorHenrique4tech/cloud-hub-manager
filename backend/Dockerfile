FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Normaliza quebras de linha do entrypoint (evita quebra quando editado no Windows/CRLF)
RUN sed -i 's/\r$//' /app/entrypoint.sh

# Expose port
EXPOSE 8000

# Run migrations then start server
CMD ["bash", "/app/entrypoint.sh"]
