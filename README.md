# Installation
## Package Manager
Le package manager utilisé pour ce projet est ``pnpm``, si vous ne l'avez pas déjà installé il peut être installé via npm (version utilisé pour le développement) : 
```bash
npm install -g pnpm@latest-10
```
Soit via [pacman](https://archlinux.org/packages/extra/any/pnpm/) directement (version non testé ici).

> [!NOTE]
> La version de pnpm utilisé est 10.20.0


## Installation des packages : 
Que ce soit pour le client ou le serveur la commande est la même : 
```bash
pnpm install
```


> [!IMPORTANT]
> Commande a executer dans les dossier client et server

## Lancement en mode production
```bash
pnpm run build && pnpm run start
```

> [!IMPORTANT]
> Commande a executer dans les dossier client et server


# Utilisation
L'application sera disponnible sur à l'adresse ``http://localhost:3000``.  
Le backend lui sera disponnible à l'adresse ``http://localhost:3003``


# Base de donnée 
Utilisation de SQLite, si le fichier ``database.db`` n'est pas présent à la racine du serveur alors le backend ne se lancera pas
