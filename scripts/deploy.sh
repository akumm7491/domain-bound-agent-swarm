#!/bin/bash

set -e

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    local missing_tools=()
    
    if ! command_exists docker; then
        missing_tools+=("docker")
    fi
    if ! command_exists kubectl; then
        missing_tools+=("kubectl")
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        echo "Error: Missing required tools: ${missing_tools[*]}"
        exit 1
    fi
}

# Function to wait for deployment
wait_for_deployment() {
    local deployment=$1
    local namespace=$2
    local timeout=$3
    
    echo "Waiting for deployment $deployment to be ready..."
    kubectl wait --for=condition=available deployment/$deployment -n $namespace --timeout=${timeout}s
}

# Function to deploy Docker environment
deploy_docker() {
    echo "Deploying Docker environment..."
    
    # Create necessary directories
    mkdir -p logs data monitoring
    
    # Build and start services
    docker-compose up -d --build
    
    # Wait for services to be healthy
    echo "Waiting for services to be healthy..."
    sleep 10
    
    # Check service health
    if ! docker-compose ps | grep -q "Up (healthy)"; then
        echo "Error: Some services are not healthy"
        docker-compose ps
        exit 1
    fi
    
    echo "Docker deployment complete!"
    echo "Services:"
    echo "- Application: http://localhost:3000"
    echo "- Redis Commander: http://localhost:8081"
    echo "- Prometheus: http://localhost:9090"
    echo "- Grafana: http://localhost:3001 (admin/admin)"
}

# Function to deploy Kubernetes environment
deploy_kubernetes() {
    echo "Deploying Kubernetes environment..."
    
    # Create namespace
    kubectl apply -f k8s/namespace.yaml
    
    # Apply ConfigMaps and Secrets
    kubectl apply -f k8s/configmap.yaml
    kubectl apply -f k8s/secret.yaml
    
    # Deploy Redis
    kubectl apply -f k8s/redis.yaml
    
    # Wait for Redis to be ready
    echo "Waiting for Redis to be ready..."
    kubectl wait --for=condition=ready pod -l app=redis -n asmmp --timeout=120s || {
        echo "Error: Redis pods failed to become ready"
        exit 1
    }
    
    # Deploy application
    kubectl apply -f k8s/deployment.yaml
    kubectl apply -f k8s/service.yaml
    
    # Deploy monitoring
    kubectl apply -f k8s/monitoring.yaml
    
    # Deploy ingress
    kubectl apply -f k8s/ingress.yaml
    
    # Wait for application to be ready
    wait_for_deployment "asmmp" "asmmp" 180 || {
        echo "Error: Application deployment failed to become ready"
        exit 1
    }
    
    echo "Kubernetes deployment complete!"
    echo "Services deployed:"
    kubectl get services -n asmmp
    echo
    echo "Pods status:"
    kubectl get pods -n asmmp
    echo
    echo "Access URLs:"
    echo "- Application: http://192.168.86.250"
    echo "- Grafana: http://192.168.86.250/grafana (admin/admin)"
}

# Main deployment process
main() {
    check_prerequisites
    
    echo "Starting deployment process..."
    
    # Build Docker image
    echo "Building Docker image..."
    docker build -t asmmp:latest . || {
        echo "Error: Failed to build Docker image"
        exit 1
    }
    
    # Determine deployment environment
    if [ "$1" = "docker" ]; then
        deploy_docker
    elif [ "$1" = "kubernetes" ]; then
        deploy_kubernetes
    else
        echo "Error: Please specify deployment environment (docker or kubernetes)"
        echo "Usage: $0 [docker|kubernetes]"
        exit 1
    fi
}

# Run main function with command line argument
main "$1" 