FROM python:3.10-slim

WORKDIR /opt/dagster/app

# 1. Install System Dependencies
# libgomp1 is good to have just in case we add ML libs later.
RUN apt-get update && apt-get install -y \
    git \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# 2. Install CPU-only PyTorch (Keeps image small and prevents timeout)
RUN pip install --default-timeout=100 torch torchvision --index-url https://download.pytorch.org/whl/cpu

# 3. Install requirements
COPY requirements.txt .
RUN pip install --default-timeout=100 -r requirements.txt

# 3. Copy Code
COPY . .

# Run Dagster gRPC server
CMD ["dagster", "api", "grpc", "-h", "0.0.0.0", "-p", "4002", "-f", "summarize.py"]
