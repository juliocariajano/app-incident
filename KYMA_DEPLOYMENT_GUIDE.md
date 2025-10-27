# 🚀 Guía de Despliegue en SAP BTP Kyma Runtime

## 📋 Información del Proyecto

- **Aplicación:** Incident Management
- **Namespace Kyma:** `incident-management`
- **Cluster Kyma:** `c-7dcf68a.kyma.ondemand.com`
- **Subaccount BTP:** `985f790a-d255-4214-a518-eed2b937f87a`
- **XSUAA App Name:** `app-incidents-incident-management`

---

## 🌐 URLs de Producción

### Backend API (CAP OData Services)

**ProcessorService:**
```
https://incident-management-srv-incident-management.c-7dcf68a.kyma.ondemand.com/odata/v4/processor
```

**AdminService:**
```
https://incident-management-srv-incident-management.c-7dcf68a.kyma.ondemand.com/odata/v4/admin
```

**Metadata (para testing):**
```
https://incident-management-srv-incident-management.c-7dcf68a.kyma.ondemand.com/odata/v4/processor/$metadata
```

### Aplicación UI5 (Fiori)

⚠️ **IMPORTANTE**: La aplicación UI5 se despliega en el **HTML5 Application Repository** y requiere un **approuter** para acceder.

**Opciones de acceso:**

1. **Desde BTP Cockpit** (más rápido):
   - BTP Cockpit → Subaccount → **HTML5 Applications**
   - Buscar: `nsincidents` o `incidents`
   - Hacer clic para abrir

2. **Con Approuter desplegado** (próximo paso):
   - Requiere agregar y desplegar un approuter standalone
   - Ver sección "Agregar Approuter al Proyecto" más abajo

3. **Con SAP Build Work Zone**:
   - Suscribirse al servicio SAP Build Work Zone
   - Agregar la aplicación al Launchpad

### Cómo Obtener las URLs

```bash
# Ver todas las rutas públicas
kubectl get apirules -n incident-management

# Ver detalles de una ruta específica
kubectl get apirule incident-management-srv -n incident-management -o yaml

# Ver los servicios disponibles en el backend
kubectl logs -l app.kubernetes.io/name=srv -n incident-management | grep "serving"
```

---

## 🛠️ Comandos de Despliegue

### 1. Build del Proyecto
```bash
# Generar artefactos de producción y Helm chart completo
cds build --production
```

**Resultado:** Se genera el directorio `gen/` con:
- `gen/db/` - Artefactos HANA HDI
- `gen/srv/` - Servidor Node.js
- `gen/chart/` - Helm chart completo con templates

### 2. Build de Imágenes Docker
```bash
# Backend Service
docker build -t cariajano/incident-management-srv:1.0.0 -f gen/srv/Dockerfile .
docker push cariajano/incident-management-srv:1.0.0

# HANA Deployer
docker build -t cariajano/incident-management-hana-deployer:1.0.0 -f gen/db/Dockerfile .
docker push cariajano/incident-management-hana-deployer:1.0.0

# HTML5 Apps Deployer
docker build -t cariajano/incident-management-html5-deployer:1.0.0 -f app/Dockerfile .
docker push cariajano/incident-management-html5-deployer:1.0.0
```

### 3. Configurar values.yaml

**Archivo:** `gen/chart/values.yaml`

**Configuraciones importantes:**

```yaml
global:
  domain: c-7dcf68a.kyma.ondemand.com
  imagePullSecret:
    name: docker-registry
  image:
    registry: docker.io/cariajano
    tag: "1.0.0"

srv:
  image:
    repository: incident-management-srv

xsuaa:
  serviceOfferingName: xsuaa
  servicePlanName: application
  parameters:
    tenant-mode: dedicated
    oauth2-configuration:
      redirect-uris:
        - https://*.{{ tpl .Values.global.domain . }}/**
    xsappname: app-incidents-{{ .Release.Namespace }}
    # ⚠️ IMPORTANTE: Agregar scopes y role-templates
    scopes:
      - name: "$XSAPPNAME.support"
        description: "support"
      - name: "$XSAPPNAME.admin"
        description: "admin"
    role-templates:
      - name: "support"
        description: "generated"
        scope-references:
          - "$XSAPPNAME.support"
      - name: "admin"
        description: "generated"
        scope-references:
          - "$XSAPPNAME.admin"

hana-deployer:
  image:
    repository: incident-management-hana-deployer

html5-apps-deployer:
  env:
    SAP_CLOUD_SERVICE: service
  image:
    repository: incident-management-html5-deployer
```

### 4. Crear Docker Registry Secret

```bash
kubectl create secret docker-registry docker-registry \
  --docker-server=docker.io \
  --docker-username=cariajano \
  --docker-password=YOUR_PASSWORD \
  --docker-email=YOUR_EMAIL \
  -n incident-management
```

### 5. Mapear HANA Cloud Instance

**Pasos en BTP Cockpit:**

1. SAP HANA Cloud Central
2. Instance Mapping
3. Add Mapping
4. **Environment Instance ID:** (de Kyma)
5. **Namespace:** `incident-management`
6. **Review and Save** ⚠️ **NO olvidar este paso**

**Obtener Environment Instance ID:**
```bash
kubectl get configmap -n kube-system shoot-info -o yaml
```
Buscar: `shootName: c-7dcf68a`

### 6. Desplegar con Helm

**Primer despliegue:**
```bash
helm install incident-management ./gen/chart -n incident-management
```

**Actualizar despliegue:**
```bash
helm upgrade incident-management ./gen/chart -n incident-management
```

**Ver status:**
```bash
helm status incident-management -n incident-management
```

**Ver releases:**
```bash
helm list -n incident-management
```

---

## 🔍 Monitoreo y Troubleshooting

### Verificar Estado de Servicios BTP

```bash
# Service Instances (XSUAA, HANA, Destination, HTML5)
kubectl get serviceinstances -n incident-management

# Service Bindings (conexiones entre pods y servicios)
kubectl get servicebindings -n incident-management

# Secrets generados por los bindings
kubectl get secrets -n incident-management
```

### Verificar Estado de Pods

```bash
# Ver todos los pods
kubectl get pods -n incident-management

# Ver detalles de un pod específico
kubectl describe pod <pod-name> -n incident-management

# Ver logs de un pod
kubectl logs <pod-name> -n incident-management

# Ver logs de un job (deployers)
kubectl logs -l job-name=incident-management-hana-deployer-0001 -n incident-management
```

### Verificar Estado de Jobs (Deployers)

```bash
# Ver todos los jobs
kubectl get jobs -n incident-management

# Ver logs del HANA deployer
kubectl logs -l job-name=incident-management-hana-deployer-0001 -n incident-management --tail=50

# Ver logs del HTML5 deployer
kubectl logs -l job-name=incident-management-html5-apps-deployer-0001 -n incident-management --tail=50
```

### Verificar Rutas Públicas

```bash
# Ver APIRules (rutas de acceso público)
kubectl get apirules -n incident-management

# Ver detalles de un APIRule
kubectl get apirule incident-management-srv -n incident-management -o yaml
```

---

## 🔴 Incidencias Resueltas

### INCIDENCIA #1: Pods Fallando - "Secret Not Found"

**Síntomas:**
```
Error: MountVolume.SetUp failed for volume "hana-binding"
Secret "incident-management-hana-deployer-hana" not found
```

**Causa:**
Los pods intentaron arrancar **ANTES** que los ServiceBindings crearan los secrets. Condición de carrera temporal en el primer despliegue.

**Diagnóstico:**
```bash
# 1. Verificar ServiceInstances
kubectl get serviceinstances -n incident-management

# 2. Verificar ServiceBindings
kubectl get servicebindings -n incident-management

# 3. Verificar Secrets
kubectl get secrets -n incident-management
```

**Solución:**
**¡Ninguna acción requerida!** Los errores son temporales. Kubernetes reintenta automáticamente hasta que los secrets estén disponibles.

**Timeline:**
1. HANA Cloud crea la instancia (1-2 min)
2. ServiceBindings generan los secrets (10-30 seg)
3. Kubernetes reinicia los pods fallidos automáticamente
4. Pods arrancan exitosamente

**Resultado:**
```
✅ hana-deployer       - Completed (54 artefactos desplegados)
✅ html5-apps-deployer - Completed
✅ srv                 - Running (2/2 pods)
```

---

### INCIDENCIA #2: Roles No Aparecen en BTP Cockpit

**Síntomas:**
Los roles `support` y `admin` no aparecen en BTP Cockpit → Security → Role Collections.

**Causa:**
El `values.yaml` generado por `cds build --production` **NO incluía** los `scopes` y `role-templates` del `xs-security.json`.

**Diagnóstico:**

1. **Verificar xs-security.json:**
```json
{
  "scopes": [
    { "name": "$XSAPPNAME.support", "description": "support" },
    { "name": "$XSAPPNAME.admin", "description": "admin" }
  ],
  "role-templates": [
    { "name": "support", "scope-references": ["$XSAPPNAME.support"] },
    { "name": "admin", "scope-references": ["$XSAPPNAME.admin"] }
  ]
}
```

2. **Verificar XSUAA en Kubernetes:**
```bash
kubectl get serviceinstance incident-management-xsuaa -n incident-management -o yaml
```

**Problema encontrado:** El `spec.parameters` NO tenía `scopes` ni `role-templates`.

**Solución:**

1. **Editar `gen/chart/values.yaml`** - Agregar scopes y role-templates:
```yaml
xsuaa:
  parameters:
    scopes:
      - name: "$XSAPPNAME.support"
        description: "support"
      - name: "$XSAPPNAME.admin"
        description: "admin"
    role-templates:
      - name: "support"
        description: "generated"
        scope-references:
          - "$XSAPPNAME.support"
      - name: "admin"
        description: "generated"
        scope-references:
          - "$XSAPPNAME.admin"
```

2. **Actualizar despliegue:**
```bash
helm upgrade incident-management ./gen/chart -n incident-management
```

3. **Verificar actualización:**
```bash
kubectl get serviceinstance incident-management-xsuaa -n incident-management -o yaml
```

**Resultado:**
```yaml
status:
  conditions:
  - message: ServiceInstance updated successfully
    reason: Updated
    status: "True"
```

**Ver roles en BTP Cockpit:**
1. BTP Cockpit → Security → Role Collections
2. Create o editar Role Collection
3. En "Roles" buscar: `app-incidents-incident-management`
4. Seleccionar roles: `support` y `admin`
5. Asignar a usuarios

---

## 📚 Arquitectura del Flujo

```
┌─────────────────────┐
│  xs-security.json   │ (Define scopes y role-templates)
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ gen/chart/          │
│   values.yaml       │ (Configuración Helm - AGREGAR roles manualmente)
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  helm upgrade       │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ ServiceInstance     │ (Kubernetes CRD)
│   (XSUAA)           │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ SAP BTP Service     │
│   Operator          │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ BTP Subaccount      │
│   XSUAA Service     │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ BTP Cockpit         │
│ Security → Roles    │
└─────────────────────┘
```

---

## 🔧 Comandos Útiles de Kubernetes

### Namespace
```bash
# Crear namespace
kubectl create namespace incident-management

# Listar namespaces
kubectl get namespaces

# Establecer namespace por defecto
kubectl config set-context --current --namespace=incident-management
```

### Logs
```bash
# Ver logs en tiempo real
kubectl logs -f <pod-name> -n incident-management

# Ver logs de un contenedor específico en un pod
kubectl logs <pod-name> -c <container-name> -n incident-management

# Ver logs de pods anteriores (crashed)
kubectl logs <pod-name> --previous -n incident-management
```

### Debugging
```bash
# Ejecutar comando dentro de un pod
kubectl exec -it <pod-name> -n incident-management -- /bin/sh

# Ver eventos del namespace
kubectl get events -n incident-management --sort-by='.lastTimestamp'

# Describir un recurso (muy útil para debugging)
kubectl describe pod <pod-name> -n incident-management
kubectl describe serviceinstance <instance-name> -n incident-management
```

### Limpieza
```bash
# Eliminar el despliegue completo
helm uninstall incident-management -n incident-management

# Eliminar recursos manualmente
kubectl delete serviceinstance --all -n incident-management
kubectl delete servicebinding --all -n incident-management
kubectl delete secret docker-registry -n incident-management

# Eliminar namespace completo
kubectl delete namespace incident-management
```

---

## ✅ Checklist de Despliegue

### Pre-requisitos
- [ ] Cuenta SAP BTP con subaccount
- [ ] Kyma Runtime habilitado
- [ ] HANA Cloud Instance creada
- [ ] Entitlements configurados:
  - [ ] XSUAA (application plan)
  - [ ] HANA Cloud (hdi-shared plan)
  - [ ] Destination Service (lite plan)
  - [ ] HTML5 Application Repository (app-host plan)
- [ ] Docker Hub account
- [ ] `kubectl` configurado y conectado a Kyma
- [ ] `helm` instalado

### Build y Push de Imágenes
- [ ] `cds build --production` ejecutado
- [ ] Imagen `incident-management-srv` construida y pusheada
- [ ] Imagen `incident-management-hana-deployer` construida y pusheada
- [ ] Imagen `incident-management-html5-deployer` construida y pusheada

### Configuración Kyma
- [ ] Namespace `incident-management` creado
- [ ] Secret `docker-registry` creado
- [ ] HANA Cloud Instance mapeada al namespace
- [ ] `values.yaml` configurado correctamente:
  - [ ] `global.domain` correcto
  - [ ] `global.image.registry` apuntando a Docker Hub
  - [ ] `global.image.tag` correcto
  - [ ] Repositorios de imágenes correctos
  - [ ] **XSUAA scopes y role-templates agregados**
  - [ ] `SAP_CLOUD_SERVICE` igual al de `manifest.json`

### Despliegue
- [ ] `helm lint ./gen/chart` sin errores
- [ ] `helm install` o `helm upgrade` ejecutado exitosamente
- [ ] ServiceInstances en estado `Created`
- [ ] ServiceBindings en estado `Created`
- [ ] Secrets creados
- [ ] Pods en estado `Running` o `Completed`
- [ ] APIRules en estado `Ready`

### Post-Despliegue
- [ ] URL del servicio accesible
- [ ] Roles visibles en BTP Cockpit
- [ ] Role Collections creadas
- [ ] Usuarios asignados a Role Collections
- [ ] Aplicación UI5 funcional

---

---

## ✅ Estado del Despliegue

### Componentes Desplegados y Funcionando

| Componente | Estado | URL/Detalles |
|------------|--------|--------------|
| **Backend (srv)** | ✅ Running | `https://incident-management-srv-incident-management.c-7dcf68a.kyma.ondemand.com` |
| **HANA Cloud** | ✅ Connected | HDI Container desplegado |
| **XSUAA** | ✅ Active | Autenticación funcionando (401 en peticiones sin token) |
| **HTML5 Apps** | ✅ Deployed | Almacenadas en HTML5 App Repository |
| **Destination Service** | ✅ Configured | Destination `srv-api` creado |
| **Approuter** | ⚠️ Deployed | Requiere configuración adicional de OAuth redirect |

### Verificación del Backend

```bash
# Verificar que el backend responde (debería dar 401 - Unauthorized)
curl https://incident-management-srv-incident-management.c-7dcf68a.kyma.ondemand.com/odata/v4/processor/\$metadata

# Resultado esperado:
# {"error":{"message":"Unauthorized","code":"401"}}
# Esto confirma que el backend funciona y la seguridad está activa ✅
```

---

## 🌐 Agregar Approuter al Proyecto (Opcional pero Recomendado)

### ¿Por Qué Necesitas un Approuter?

El **approuter** es necesario para:
- Servir las aplicaciones UI5 del HTML5 Application Repository
- Manejar la autenticación XSUAA
- Enrutar peticiones al backend CAP
- Proporcionar una URL única para acceder a toda la aplicación

### Pasos para Agregar Approuter

**1. Agregar approuter al proyecto:**
```bash
cds add approuter
```

**2. Revisar la configuración generada:**
- Se crea un directorio `app/approuter/` con:
  - `package.json` - Dependencias del approuter
  - `xs-app.json` - Rutas y configuración de seguridad

**3. Agregar build del approuter:**
Editar `package.json` en la raíz:
```json
{
  "cds": {
    "build": {
      "production": {
        "approuter": {
          "src": "app/approuter",
          "target": "gen/approuter"
        }
      }
    }
  }
}
```

**4. Crear Dockerfile para approuter:**

Crear `gen/approuter/Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["node", "node_modules/@sap/approuter/approuter.js"]
```

**5. Build y push de la imagen:**
```bash
# Build de producción
cds build --production

# Build de la imagen Docker
docker build -t cariajano/incident-management-approuter:1.0.0 -f gen/approuter/Dockerfile gen/approuter
docker push cariajano/incident-management-approuter:1.0.0
```

**6. Actualizar `gen/chart/values.yaml`:**

Agregar configuración del approuter:
```yaml
approuter:
  image:
    repository: incident-management-approuter
  bindings:
    xsuaa:
      serviceInstanceName: xsuaa
    destination:
      serviceInstanceName: destination
    html5-apps-repo:
      serviceInstanceName: html5-apps-repo-host
      serviceInstanceFullName: incident-management-html5-apps-repo-host
  resources:
    limits:
      cpu: 500m
      memory: 500M
    requests:
      cpu: 200m
      memory: 500M
  deployment:
    expose:
      enabled: true
```

**7. Redesplegar:**
```bash
helm upgrade incident-management ./gen/chart -n incident-management
```

**8. Obtener la URL del approuter:**
```bash
kubectl get apirule -n incident-management
```

La URL del approuter será algo como:
```
https://incident-management-approuter-incident-management.c-7dcf68a.kyma.ondemand.com
```

### Ventajas del Approuter

✅ Una sola URL para acceder a todo (UI + backend)  
✅ Autenticación centralizada  
✅ Mejor experiencia de usuario  
✅ Compatible con SAP Fiori Launchpad  
✅ Soporte para múltiples aplicaciones UI5  

---

---

## ⚠️ Problemas Conocidos y Soluciones

### Approuter: OAuth Redirect URI Issue

**Problema:**
El approuter en Kyma usa la IP interna del pod como redirect_uri en lugar de la URL pública:
```
redirect_uri=http://10.96.0.X:8080/login/callback  ❌
Debería ser: https://incident-management-approuter-incident-management.c-7dcf68a.kyma.ondemand.com/login/callback ✅
```

**Causa:**
El Istio Service Mesh no está pasando los headers `X-Forwarded-*` correctamente al approuter.

**Soluciones Intentadas:**
1. ✅ Agregado `TENANT_HOST_PATTERN` en variables de entorno
2. ⚠️ Configuración de headers en APIRule (requiere configuración adicional de Istio)

**Soluciones Alternativas:**

1. **Usar Launchpad de BTP (Cloud Foundry):**
   - URL: `https://development-cap-qglkhsqw.launchpad.cfapps.us10.hana.ondemand.com`
   - Limitación: El Managed Approuter de CF no puede conectar directamente al backend en Kyma
   - Solución: Crear un Destination público en BTP que apunte al backend en Kyma

2. **Acceso Directo al Backend con Postman:**
   - Obtener token OAuth2 de XSUAA manualmente
   - Usar el token en las peticiones al backend
   - Útil para testing y desarrollo

3. **Desplegar Approuter en Cloud Foundry (en lugar de Kyma):**
   - El approuter en CF tiene mejor integración con XSUAA
   - Puede servir las apps del HTML5 Repository
   - Conecta al backend en Kyma mediante Destination Service

**Configuración Adicional Requerida (Avanzado):**

Para que el approuter funcione completamente en Kyma, se requiere:

1. **Configurar Istio VirtualService con headers:**
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: approuter-headers
spec:
  hosts:
  - incident-management-approuter
  http:
  - headers:
      request:
        set:
          x-forwarded-proto: https
          x-forwarded-host: incident-management-approuter-incident-management.c-7dcf68a.kyma.ondemand.com
    route:
    - destination:
        host: incident-management-approuter
```

2. **O configurar EnvoyFilter para inyectar headers**

---

## 📞 Referencias

- **SAP CAP Documentation:** https://cap.cloud.sap/docs/
- **Kyma Documentation:** https://kyma-project.io/docs/
- **SAP BTP Service Operator:** https://github.com/SAP/sap-btp-service-operator
- **Helm Documentation:** https://helm.sh/docs/
- **Istio Documentation:** https://istio.io/latest/docs/
- **SAP Approuter:** https://www.npmjs.com/package/@sap/approuter

---

## 📝 Notas Importantes

1. **cds build --production** siempre regenera `gen/chart/values.yaml` con valores por defecto. Si tienes personalizaciones (como scopes de XSUAA), debes agregarlas manualmente después de cada build.

2. **HANA Instance Mapping** debe guardarse con "Review and Save". Si no lo guardas, el secret no se creará en Kyma.

3. **Docker Registry Secret** debe existir antes del despliegue. Sin él, Kubernetes no puede descargar las imágenes privadas.

4. **Primera vez que despliegas** es normal ver errores temporales de "Secret not found". Espera 2-3 minutos y los pods se autocorregirán.

5. **Actualización de roles en BTP Cockpit** puede tardar 2-3 minutos en sincronizarse después de un `helm upgrade`.

---

**Última actualización:** 22 de Octubre, 2025
**Autor:** Julio Cariajano
**Ambiente:** SAP BTP Kyma Runtime

