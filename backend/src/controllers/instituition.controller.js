const mongoose = require("mongoose");
const Institution = require("../models/Institution");

const TYPES = ["ENGINEERING", "POLYTECHNIC", "MANAGEMENT", "PHARMACY", "OTHER"];

const isValidId = (id) => mongoose.isValidObjectId(id);

function pickFields(body) {
  const data = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.aicteId !== undefined) data.aicteId = String(body.aicteId).trim();
  if (body.type !== undefined) data.type = body.type;
  if (body.contactEmail !== undefined) data.contactEmail = body.contactEmail;
  if (body.contactPhone !== undefined) data.contactPhone = body.contactPhone;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  if (body.address) {
    ["line1", "city", "state", "pincode"].forEach((f) => {
      if (body.address[f] !== undefined) data["address." + f] = body.address[f];
    });
  }
  return data;
}

//public
exports.getPublicInstitutions = async (req, res) => {
  try {
    const institutions = await Institution.find({ isActive: true })
      .select("name aicteId address.city address.state")
      .sort({ name: 1 })
      .limit(500);
    return res.json({ institutions });
  } catch (err) {
    console.error("getPublicInstitutions error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

//admin
exports.createInstitution = async (req, res) => {
  try {
    const data = pickFields(req.body);

    if (!data.name || !data.aicteId) {
      return res.status(400).json({ message: "name and aicteId are required" });
    }
    if (data.type && !TYPES.includes(data.type)) {
      return res
        .status(400)
        .json({ message: "type must be one of: " + TYPES.join(", ") });
    }

    const institution = await Institution.create(data);
    return res
      .status(201)
      .json({ message: "Institution created", institution });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ message: "An institution with this aicteId already exists" });
    }
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: err.message });
    }
    console.error("createInstitution error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

//admin + author
exports.getInstitutions = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

    const filter = {};
    if (req.query.state) filter["address.state"] = req.query.state;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.isActive) filter.isActive = req.query.isActive === "true";
    if (req.query.search) {
      const escaped = String(req.query.search).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      filter.name = new RegExp(escaped, "i");
    }

    const institutions = await Institution.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const total = await Institution.countDocuments(filter);

    return res.json({
      institutions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("getInstitutions error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

//admin + author
exports.getInstitutionById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid institution id" });
    }
    const institution = await Institution.findById(req.params.id);
    if (!institution)
      return res.status(404).json({ message: "Institution not found" });
    return res.json({ institution });
  } catch (err) {
    console.error("getInstitutionById error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

//admin
exports.updateInstitution = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid institution id" });
    }
    const data = pickFields(req.body);
    if (data.type && !TYPES.includes(data.type)) {
      return res
        .status(400)
        .json({ message: "type must be one of: " + TYPES.join(", ") });
    }

    const institution = await Institution.findById(req.params.id);
    if (!institution)
      return res.status(404).json({ message: "Institution not found" });

    Object.keys(data).forEach((key) => institution.set(key, data[key]));
    await institution.save();

    return res.json({ message: "Institution updated", institution });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ message: "An institution with this aicteId already exists" });
    }
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: err.message });
    }
    console.error("updateInstitution error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
