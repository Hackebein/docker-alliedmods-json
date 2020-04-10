FROM node:8-onbuild
ENTRYPOINT ["npm", "start"]
CMD ["mmsource|sourcemod|amxmodx", "linux|mac|windows"]
