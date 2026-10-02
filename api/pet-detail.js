export default async function handler(req, res) {
  try {
    const { contentId } = req.query;

    // contentId가 없으면 오류
    if (!contentId) {
      return res.status(400).json({
        error: "contentId가 필요합니다.",
      });
    }

    // Vercel에 저장해둔 공공데이터 API 키
    const serviceKey = process.env.TOUR_API_KEY;

    if (!serviceKey) {
      return res.status(500).json({
        error: "TOUR_API_KEY가 설정되어 있지 않습니다.",
      });
    }

    // 공공데이터 API 요청값
    const params = new URLSearchParams({
      serviceKey: serviceKey,
      MobileOS: "WEB",
      MobileApp: "DANGJeju",
      _type: "json",
      contentId: contentId,
    });

    const url =
      `https://apis.data.go.kr/B551011/KorService2/detailPetTour2?${params.toString()}`;

    const response = await fetch(url);

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "공공데이터 응답을 JSON으로 변환하지 못했습니다.",
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "공공데이터 API 호출 중 오류가 발생했습니다.",
    });
  }
}
