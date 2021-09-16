module.exports = function returnMsg(req, res) {
  if (req.error) {
    res.status(req.error.code).json(req.error);
  } else if (req.result.json) {
    res.status(req.result.code).json(req.result.json);
  } else if (req.result.xml) {
    res.type('application/xml');
    res.status(req.result.code).send(req.result.xml);
  } else {
    res.status(req.result.code).send(req.result.img);
  }
};
