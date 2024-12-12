#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Print step message
print_step() {
    echo -e "${GREEN}==>${NC} $1"
}

# Print warning message
print_warning() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

# Print error message
print_error() {
    echo -e "${RED}ERROR:${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_step "Checking prerequisites..."
    
    local missing_tools=()
    
    if ! command -v kubectl &> /dev/null; then
        missing_tools+=("kubectl")
    fi
    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi

    # Check kubectl context
    local current_context=$(kubectl config current-context 2>/dev/null || echo "")
    if [ -z "$current_context" ]; then
        print_error "No Kubernetes context found. Please configure kubectl"
        exit 1
    fi
    print_warning "Using Kubernetes context: $current_context"

    # Verify cluster access
    if ! kubectl cluster-info &> /dev/null; then
        print_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
}

# Validate environment
validate_environment() {
    print_step "Validating environment..."

    # Check for required files
    local required_files=(
        "k8s/namespace.yaml"
        "k8s/configmap.yaml"
        "k8s/secret.yaml"
        "k8s/redis.yaml"
        "k8s/deployment.yaml"
        "k8s/service.yaml"
        "k8s/monitoring.yaml"
        "k8s/ingress.yaml"
    )

    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            print_error "Required file not found: $file"
            exit 1
        fi
    done

    # Check for required environment variables in configmap
    if ! grep -q "REDIS_URL" k8s/configmap.yaml; then
        print_error "REDIS_URL not found in configmap"
        exit 1
    fi

    # Check for storage class
    if ! kubectl get storageclass standard &> /dev/null; then
        print_warning "Standard storage class not found. Creating default storage class..."
        kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: k8s.io/minikube-hostpath
reclaimPolicy: Delete
volumeBindingMode: Immediate
EOF
    fi
}

# Build and push Docker image
build_image() {
    print_step "Building Docker image..."
    
    if [ -n "$REGISTRY" ]; then
        print_step "Using registry: $REGISTRY"
        IMAGE_TAG="$REGISTRY/asmmp:latest"
    else
        IMAGE_TAG="asmmp:latest"
    fi

    if ! docker build -t "$IMAGE_TAG" .; then
        print_error "Failed to build Docker image"
        exit 1
    fi
    
    if [ -n "$REGISTRY" ]; then
        print_step "Pushing image to registry..."
        if ! docker push "$IMAGE_TAG"; then
            print_error "Failed to push image to registry"
            exit 1
        fi
    fi
}

# Set up storage
setup_storage() {
    print_step "Setting up storage..."
    
    # Delete existing storage resources
    kubectl delete pv --all 2>/dev/null || true
    kubectl delete storageclass local-storage 2>/dev/null || true
    
    # Apply new storage configuration
    kubectl apply -f k8s/storage-provisioner.yaml
    
    # Wait for storage class to be ready
    print_step "Waiting for storage class to be ready..."
    kubectl wait --for=condition=Available storageclass/local-storage --timeout=30s || true
}

# Deploy to Kubernetes
deploy() {
    print_step "Creating namespace and resources..."
    
    # Create namespace
    kubectl apply -f k8s/namespace.yaml
    
    # Set up storage
    setup_storage
    
    # Create ConfigMaps and Secrets
    kubectl apply -f k8s/configmap.yaml
    kubectl apply -f k8s/secret.yaml
    
    # Clean up existing Redis StatefulSet if it exists
    print_step "Cleaning up existing Redis deployment..."
    kubectl delete statefulset redis -n asmmp --cascade=foreground --wait=true 2>/dev/null || true
    kubectl delete pvc -l app=redis -n asmmp 2>/dev/null || true
    
    # Deploy Redis
    print_step "Deploying Redis..."
    kubectl apply -f k8s/redis.yaml
    
    # Wait for PVC to be bound
    print_step "Waiting for Redis PVC to be bound..."
    if ! kubectl wait --for=condition=bound pvc/redis-data-redis-0 -n asmmp --timeout=60s; then
        print_error "Redis PVC failed to bind"
        kubectl describe pvc redis-data-redis-0 -n asmmp
        kubectl describe pv
        exit 1
    fi
    
    # Wait for Redis pod to be ready
    print_step "Waiting for Redis pod to be ready..."
    if ! kubectl wait --for=condition=ready pod -l app=redis -n asmmp --timeout=120s; then
        print_error "Redis pod failed to become ready"
        kubectl describe pod -l app=redis -n asmmp
        kubectl logs -l app=redis -n asmmp
        exit 1
    fi
    
    # Deploy application
    print_step "Deploying application..."
    kubectl apply -f k8s/deployment.yaml
    kubectl apply -f k8s/service.yaml
    
    # Deploy monitoring
    print_step "Deploying monitoring..."
    kubectl apply -f k8s/monitoring.yaml
    
    # Deploy ingress
    print_step "Deploying ingress..."
    kubectl apply -f k8s/ingress.yaml
    
    # Wait for application to be ready
    print_step "Waiting for application to be ready..."
    if ! kubectl wait --for=condition=available deployment/asmmp -n asmmp --timeout=180s; then
        print_error "Application failed to become ready"
        print_step "Application pod logs:"
        kubectl logs -l app=asmmp -n asmmp
        exit 1
    fi
}

# Print deployment info
print_info() {
    print_step "Deployment complete!"
    echo
    echo "Services deployed:"
    kubectl get services -n asmmp
    echo
    echo "Pods status:"
    kubectl get pods -n asmmp
    echo
    echo "Access URLs:"
    local ingress_ip=""
    local retries=0
    while [ -z "$ingress_ip" ] && [ $retries -lt 30 ]; do
        ingress_ip=$(kubectl get ingress -n asmmp asmmp-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
        if [ -z "$ingress_ip" ]; then
            echo "Waiting for ingress IP..."
            sleep 5
            ((retries++))
        fi
    done

    if [ -n "$ingress_ip" ]; then
        echo "- Application: http://$ingress_ip"
        echo "- Grafana: http://$ingress_ip/grafana (admin/admin)"
    else
        print_warning "Ingress IP not available. Please check ingress status manually."
    fi

    print_step "Monitoring endpoints:"
    echo "- Prometheus: http://$ingress_ip/prometheus"
    echo "- Metrics: http://$ingress_ip/metrics"
}

# Cleanup function
cleanup() {
    if [ $? -ne 0 ]; then
        print_error "Deployment failed!"
        print_step "Pod status:"
        kubectl get pods -n asmmp
        print_step "Recent events:"
        kubectl get events -n asmmp --sort-by='.lastTimestamp'
    fi
}

# Main deployment process
main() {
    # Set cleanup trap
    trap cleanup EXIT
    
    check_prerequisites
    validate_environment
    
    # Check if registry is provided
    if [ -n "$1" ]; then
        REGISTRY="$1"
    fi
    
    build_image
    deploy
    print_info
}

# Run main function with optional registry argument
main "$1" 