FROM python:3.9-slim

WORKDIR /app

# Install Poetry
RUN pip install poetry

# Copy all project files BEFORE install
COPY . .

# Configure Poetry and install dependencies
RUN poetry config virtualenvs.create false && poetry install --no-interaction --no-ansi

# Expose necessary ports
EXPOSE 8000
EXPOSE 5678

# Run the app with debugpy and uvicorn
CMD ["python", "-m", "debugpy", "--listen", "0.0.0.0:5678", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
