'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Place extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      
      Place.belongsTo(models.User, { foreignKey: "userId", onDelete: "CASCADE" });
      Place.hasMany(models.Booking, { foreignKey: "placeId", onDelete: "CASCADE" });
      Place.hasMany(models.Review, { foreignKey: "placeId", onDelete: "CASCADE" });
    }
  }
  Place.init({
    name: DataTypes.STRING,
    location: DataTypes.STRING,
    description: DataTypes.TEXT,
    userId: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Place',
  });
  return Place;
};