export const WEBSITE_GALLERY_SCRIPT = `(function () {
  'use strict';

  function initDynamicGallery() {
    var annivSection = document.getElementById('anniversary');
    var wrapper = annivSection ? annivSection.querySelector('.portfolio-wrapper') : document.querySelector('.portfolio-wrapper');
    if (!wrapper) return;

    fetch('/api/website-gallery')
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (items) {
        if (!Array.isArray(items) || items.length === 0) return;

        var createdItems = [];
        var gridSizer = wrapper.querySelector('.grid-sizer');

        items.forEach(function (item) {
          if (!item.imageUrl) return;

          var fullImgUrl = item.imageUrl;
          var pdfLink = item.pdfUrl || '';

          var li = document.createElement('li');
          li.className = 'grid-item dynamic-gallery-item wow animate__fadeInUp last-paragraph-no-margin';

          var titleText = (item.title || 'OLYMPIA ANNIVERSARY').toUpperCase();

          var pdfButtonMarkup = pdfLink
            ? '<a href="' + pdfLink + '" target="_blank" rel="noopener noreferrer">Download PDF</a>'
            : '<a href="' + fullImgUrl + '" target="_blank" rel="noopener noreferrer">View Full Image</a>';

          li.innerHTML =
            '<figure>' +
              '<div class="portfolio-img bg-deep-pink position-relative text-center overflow-hidden">' +
                '<img src="' + fullImgUrl + '" alt="' + titleText + '" loading="lazy" />' +
                '<div class="portfolio-icon">' +
                  '<a class="gallery-link" title="' + titleText + '" href="' + fullImgUrl + '" target="_blank" rel="noopener noreferrer">' +
                    '<i class="fas fa-search text-extra-dark-gray" aria-hidden="true"></i>' +
                  '</a>' +
                '</div>' +
              '</div>' +
              '<figcaption class="bg-white">' +
                '<div class="portfolio-hover-main text-center">' +
                  '<div class="portfolio-hover-box align-middle">' +
                    '<div class="portfolio-hover-content position-relative">' +
                      '<span class="line-height-normal font-weight-600 text-small alt-font margin-5px-bottom text-extra-dark-gray text-uppercase d-block">' +
                        titleText +
                      '</span>' +
                      pdfButtonMarkup +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</figcaption>' +
            '</figure>';

          if (gridSizer && gridSizer.nextSibling) {
            wrapper.insertBefore(li, gridSizer.nextSibling);
          } else {
            wrapper.appendChild(li);
          }
          createdItems.push(li);
        });

        // Trigger Isotope relayout once images are loaded
        if (window.jQuery) {
          var $ = window.jQuery;
          var $grid = $(wrapper);

          var refreshLayout = function () {
            if ($grid.data('isotope')) {
              $grid.isotope('reloadItems').isotope({ sortBy: 'original-order' });
            }
          };

          if (typeof $grid.imagesLoaded === 'function') {
            $grid.imagesLoaded(refreshLayout);
          } else {
            setTimeout(refreshLayout, 200);
            setTimeout(refreshLayout, 600);
          }

          // Re-init Magnific Popup for lightboxes
          if (typeof $.fn.magnificPopup === 'function') {
            $('.lightbox-portfolio').magnificPopup({
              delegate: '.gallery-link',
              type: 'image',
              tLoading: 'Loading image #%curr%...',
              mainClass: 'mfp-fade',
              gallery: {
                enabled: true,
                navigateByImgClick: true,
                preload: [0, 1]
              }
            });
          }
        }
      })
      .catch(function (err) {
        console.warn('[Website Gallery] Sync notice:', err.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDynamicGallery);
  } else {
    initDynamicGallery();
  }
})();
`;
